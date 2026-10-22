import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InteractionContextType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { watchDirectories } from '../src/framework/bootstrap/hot-reload.js';
import { parseCron, parseEvery, Scheduler } from '../src/framework/bootstrap/scheduler.js';
import { commandBody, commandRegistry, dispatchCommand } from '../src/framework/command/command.js';
import { scheduledJobs, startHooks, stopHooks } from '../src/framework/core/lifecycle.js';
import { BaseCommand, Command, OnStart, OnStop, Scheduled, Service, UserError } from '../src/framework/index.js';

describe('cron and intervals', () => {
	it('matches 5-field cron expressions in local time', () => {
		const weekdays = parseCron('*/15 9-17 * * 1-5');
		expect(weekdays(new Date(2026, 9, 19, 9, 30))).toBe(true); // Monday
		expect(weekdays(new Date(2026, 9, 19, 9, 31))).toBe(false);
		expect(weekdays(new Date(2026, 9, 19, 18, 0))).toBe(false);
		expect(weekdays(new Date(2026, 9, 18, 9, 30))).toBe(false); // Sunday
		expect(parseCron('0 * * * *')(new Date(2026, 0, 1, 7, 0))).toBe(true);
		expect(parseCron('0 0 * * 7')(new Date(2026, 9, 18, 0, 0))).toBe(true); // 7 = Sunday
		expect(parseCron('0 0 1,15 * 1')(new Date(2026, 9, 15, 0, 0))).toBe(true); // dom OR dow
	});

	it('rejects malformed expressions', () => {
		expect(() => parseCron('61 * * * *')).toThrow();
		expect(() => parseCron('* * *')).toThrow(/5 fields/);
		expect(() => parseCron('*/0 * * * *')).toThrow();
	});

	it('parses intervals', () => {
		expect(parseEvery('250ms')).toBe(250);
		expect(parseEvery('30s')).toBe(30_000);
		expect(parseEvery('5m')).toBe(300_000);
		expect(parseEvery('2h')).toBe(7_200_000);
		expect(parseEvery(1500)).toBe(1500);
		expect(() => parseEvery('soon')).toThrow();
		expect(() => parseEvery(0)).toThrow();
	});
});

describe('Scheduler', () => {
	it('runs only the cron jobs that are due', async () => {
		const due = vi.fn();
		const other = vi.fn();
		const s = new Scheduler([
			{ name: 'due', spec: '*/5 * * * *', run: due },
			{ name: 'other', spec: '1 * * * *', run: other },
		]);
		await s.runDue(new Date(2026, 0, 1, 10, 5));
		expect(due).toHaveBeenCalledOnce();
		expect(other).not.toHaveBeenCalled();
	});

	it('never overlaps a job with itself and survives failures', async () => {
		let release: () => void = () => undefined;
		const slow = vi.fn(() => new Promise<void>((r) => (release = r)));
		const failing = vi.fn(() => {
			throw new Error('x');
		});
		const s = new Scheduler([
			{ name: 'slow', spec: '* * * * *', run: slow },
			{ name: 'failing', spec: '* * * * *', run: failing },
		]);
		const now = new Date(2026, 0, 1, 10, 0);
		const first = s.runDue(now);
		await s.runDue(now);
		expect(slow).toHaveBeenCalledOnce();
		release();
		await first;
		const third = s.runDue(now); // the previous run finished, so the job may start again
		release();
		await third;
		expect(slow).toHaveBeenCalledTimes(2);
		expect(failing).toHaveBeenCalledTimes(3);
	});

	it('fails at construction on a bad spec', () => {
		expect(() => new Scheduler([{ name: 'bad', spec: 'nope', run: () => undefined }])).toThrow();
		expect(() => new Scheduler([{ name: 'bad', spec: { every: 'x' }, run: () => undefined }])).toThrow();
	});
});

@Service()
class Jobs {
	@OnStart()
	boot() {}

	@OnStop()
	down() {}

	@Scheduled('*/5 * * * *')
	tick() {}

	@Scheduled({ every: '30s' })
	beat() {}
}

describe('lifecycle decorators', () => {
	it('register hooks and jobs for @Service classes', () => {
		expect(startHooks).toContainEqual({ ctor: Jobs, method: 'boot' });
		expect(stopHooks).toContainEqual({ ctor: Jobs, method: 'down' });
		expect(scheduledJobs.filter((j) => j.ctor === Jobs).map((j) => [j.method, j.spec])).toEqual([
			['tick', '*/5 * * * *'],
			['beat', { every: '30s' }],
		]);
	});
});

const ran: string[] = [];

@Command('admin', {
	description: 'Quản trị',
	guildOnly: true,
	defaultMemberPermissions: ['Administrator'],
	build: (b) => b.addStringOption((o) => o.setName('who').setDescription('ai')),
})
class AdminCommand extends BaseCommand {
	execute() {
		ran.push('admin');
	}
}

@Command('strict', { description: 'Luôn từ chối' })
class StrictCommand extends BaseCommand {
	execute() {
		throw new UserError('Không được phép');
	}
}

const fakeSlash = (commandName: string) => ({
	id: 'c1',
	commandName,
	user: { id: 'u1' },
	guildId: 'g1',
	replied: false,
	deferred: false,
	reply: vi.fn(async () => undefined),
	followUp: vi.fn(async () => undefined),
});

describe('@Command', () => {
	it('builds the REST body with options, permissions and guild-only context', () => {
		const body = commandBody(commandRegistry.find((c) => c.name === 'admin')!);
		expect(body).toMatchObject({
			name: 'admin',
			description: 'Quản trị',
			default_member_permissions: '8',
			contexts: [InteractionContextType.Guild],
		});
		expect(body.options).toHaveLength(1);
	});

	it('dispatches by name and answers UserError ephemerally', async () => {
		await dispatchCommand(fakeSlash('admin') as never);
		expect(ran).toEqual(['admin']);
		const strict = fakeSlash('strict');
		await dispatchCommand(strict as never);
		expect(strict.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Không được phép' }));
	});

	it('rejects duplicate names', () => {
		expect(() => Command('admin', { description: 'again' })(class extends BaseCommand { execute() {} }, {} as never)).toThrow(/Duplicate/);
	});
});

describe('watchDirectories', () => {
	it('fires for menu and command files only', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-kit-'));
		let calls = 0;
		const stop = watchDirectories([dir], () => void calls++, 30);
		try {
			fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
			fs.writeFileSync(path.join(dir, 'helper.service.ts'), 'export {}');
			await new Promise((r) => setTimeout(r, 250));
			expect(calls).toBe(0);
			fs.writeFileSync(path.join(dir, 'shop.menu.ts'), 'export {}');
			await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 3000 });
		} finally {
			stop();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
