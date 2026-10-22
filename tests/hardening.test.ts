import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { discordClientOptions } from '../src/framework/bootstrap/app.js';
import { createReloader, watchDirectories } from '../src/framework/bootstrap/hot-reload.js';
import { parseCron, parseEvery } from '../src/framework/bootstrap/scheduler.js';
import { dispatchCommand } from '../src/framework/command/command.js';
import { menuRegistry } from '../src/framework/core/decorators.js';
import {
	BaseCommand,
	BaseMenu,
	Button,
	Command,
	MemorySessionStore,
	Menu,
	Nav,
	Router,
	WizardMenu,
	cooldownMiddleware,
	permissionMiddleware,
	type MenuContext,
	type WizardStep,
} from '../src/framework/index.js';
import { fakeClick } from './helpers/fake-interaction.js';

const hits = { nuke: 0, finished: 0, guarded: 0 };

@Menu('h-root', { root: true })
class HardRoot extends BaseMenu {
	render(ctx: MenuContext) {
		return { content: 'root', components: [ctx.row(ctx.button('admin', 'A'))] };
	}

	@Button('admin')
	admin() {
		return Nav.to('h-admin');
	}
}

@Menu('h-admin', { permissions: ['Administrator'] })
class HardAdmin extends BaseMenu {
	render() {
		return { content: 'admin' };
	}

	@Button('nuke')
	nuke() {
		hits.nuke++;
	}
}

@Menu('h-wiz', { permissions: ['Administrator'] })
class HardWizard extends WizardMenu {
	readonly steps: readonly WizardStep<Record<string, unknown>>[] = [{ id: 'a', title: 'A', render: () => ({ content: 'a' }) }];

	onFinish() {
		hits.finished++;
	}
}

@Command('guarded', { description: 'g', defaultMemberPermissions: ['BanMembers'] })
class GuardedCommand extends BaseCommand {
	execute() {
		hits.guarded++;
	}
}

function setup() {
	const sessions = new MemorySessionStore();
	const router = new Router(menuRegistry, sessions, [permissionMiddleware, cooldownMiddleware()], { onError: () => undefined });
	return { router, session: sessions.create('u1', 'h-root') };
}

describe('menu-level access rules', () => {
	it('refuse Nav.to into a restricted menu and leave the session intact', async () => {
		const { router, session } = setup();
		const denied = fakeClick(session.id, 'h-root', 'admin');
		await router.handle(denied as never);
		expect(denied.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('quyền') }));
		expect(session.stack.map((s) => s.menuId)).toEqual(['h-root']);

		const allowed = fakeClick(session.id, 'h-root', 'admin', { permissions: ['Administrator'] });
		await router.handle(allowed as never);
		expect(allowed.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'admin' }));
		expect(session.stack.map((s) => s.menuId)).toEqual(['h-root', 'h-admin']);
	});

	it('cover every handler of the menu, not only the ones with their own rules', async () => {
		const { router, session } = setup();
		await router.handle(fakeClick(session.id, 'h-admin', 'nuke') as never);
		expect(hits.nuke).toBe(0);
		await router.handle(fakeClick(session.id, 'h-admin', 'nuke', { permissions: ['Administrator'] }) as never);
		expect(hits.nuke).toBe(1);
	});

	it('cover reserved actions such as the wizard finish, which has no handler of its own', async () => {
		const { router, session } = setup();
		const denied = fakeClick(session.id, 'h-wiz', '~wiz', { args: ['next'] });
		await router.handle(denied as never);
		expect(hits.finished).toBe(0);
		expect(denied.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('quyền') }));

		await router.handle(fakeClick(session.id, 'h-wiz', '~wiz', { args: ['next'], permissions: ['Administrator'] }) as never);
		expect(hits.finished).toBe(1);
	});
});

describe('@Command runtime permission check', () => {
	const slash = (permissions: string[]) => ({
		id: 'c1',
		commandName: 'guarded',
		user: { id: 'u1' },
		guildId: 'g1',
		memberPermissions: { has: (p: string[]) => p.every((x) => permissions.includes(x)) },
		replied: false,
		deferred: false,
		reply: vi.fn(async (_payload?: unknown) => undefined),
		followUp: vi.fn(async (_payload?: unknown) => undefined),
	});

	it('rejects members without the default permissions even though Discord let them see the command', async () => {
		const i = slash([]);
		await dispatchCommand(i as never);
		expect(hits.guarded).toBe(0);
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('quyền') }));
	});

	it('runs it for members that have them', async () => {
		await dispatchCommand(slash(['BanMembers']) as never);
		expect(hits.guarded).toBe(1);
	});
});

describe('safer defaults', () => {
	it('bot messages ping nobody unless you opt in', () => {
		expect(discordClientOptions().allowedMentions).toEqual({ parse: [] });
		expect(discordClientOptions({ parse: ['users'] }).allowedMentions).toEqual({ parse: ['users'] });
	});

	it('session ids are 48-bit and never reuse a live id', () => {
		expect(new MemorySessionStore().create('u', 'root').id).toMatch(/^[0-9a-f]{12}$/);
		const ids = ['aaa', 'aaa', 'bbb'];
		const store = new MemorySessionStore(1000, Date.now, () => ids.shift()!);
		expect(store.create('u1', 'root').id).toBe('aaa');
		expect(store.create('u2', 'root').id).toBe('bbb'); // the repeated "aaa" was skipped
	});

	it('cooldown table drops expired entries instead of growing forever', async () => {
		const until = new Map<string, number>();
		let t = 0;
		const mw = cooldownMiddleware(() => t, until);
		const info = { menuId: 'm', handler: { kind: 'button', id: 'b', cooldownMs: 10 } } as never;
		const as = (id: string) => ({ user: { id } }) as never;
		for (let i = 0; i < 1500; i++) await mw(as(`u${i}`), info, async () => undefined);
		expect(until.size).toBe(1500);
		t = 100;
		await mw(as('late'), info, async () => undefined);
		expect(until.size).toBe(1);
	});
});

describe('scheduler limits', () => {
	it('rejects intervals that Node would clamp to 1 ms', () => {
		expect(() => parseEvery('720h')).toThrow(/exceeds/);
		expect(() => parseEvery(2 ** 31)).toThrow(/exceeds/);
		expect(parseEvery('596h')).toBe(596 * 3_600_000);
	});

	it('treats "*/n" in day-of-month like cron does (AND with day-of-week)', () => {
		const everyOtherMonday = parseCron('0 0 */2 * 1');
		expect(everyOtherMonday(new Date(2026, 9, 19, 0, 0))).toBe(true); // Monday, odd day
		expect(everyOtherMonday(new Date(2026, 9, 26, 0, 0))).toBe(false); // Monday, even day
		expect(everyOtherMonday(new Date(2026, 9, 21, 0, 0))).toBe(false); // odd day, not Monday
	});
});

describe('hot reload', () => {
	it('does not throw for directories that do not exist yet', () => {
		const stop = watchDirectories([path.join(os.tmpdir(), 'menu-kit-missing-dir')], () => undefined);
		expect(typeof stop).toBe('function');
		stop();
	});

	it('watches the directories that exist when others are missing', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-kit-hot-'));
		let calls = 0;
		const stop = watchDirectories([path.join(dir, 'missing'), dir], () => void calls++, 30);
		try {
			fs.writeFileSync(path.join(dir, 'a.menu.ts'), 'export {}');
			await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 3000 });
		} finally {
			stop();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('never runs two reloads at once and coalesces saves that arrive meanwhile', async () => {
		const saved = [...menuRegistry];
		let active = 0;
		let maxActive = 0;
		let runs = 0;
		const rescan = async () => {
			active++;
			runs++;
			maxActive = Math.max(maxActive, active);
			menuRegistry.push(...saved); // what re-importing the files would do
			await new Promise((r) => setTimeout(r, 20));
			active--;
		};
		const reload = createReloader(['x'], async () => undefined, rescan);
		await Promise.all([reload(), reload(), reload(), reload()]);
		expect(maxActive).toBe(1);
		expect(runs).toBe(2); // the running one plus a single follow-up for the three queued saves
		expect(menuRegistry).toHaveLength(saved.length);
	});

	it('restores the previous registry when the reload fails', async () => {
		const before = [...menuRegistry];
		const reload = createReloader(
			['x'],
			async () => {
				throw new Error('broken menu');
			},
			async () => {
				menuRegistry.push(...before.slice(0, 1)); // partially re-registered before blowing up
			},
		);
		await reload();
		expect(menuRegistry).toEqual(before);
	});
});
