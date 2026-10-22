import { describe, expect, it, vi } from 'vitest';
import {
	BaseMenu,
	Button,
	MemorySessionStore,
	Menu,
	Router,
	UserError,
	createLogger,
	setLogger,
	type MenuContext,
} from '../src/framework/index.js';
import { menuRegistry } from '../src/framework/core/decorators.js';
import { fakeClick } from './helpers/fake-interaction.js';

@Menu('o-root', { root: true })
class ObsMenu extends BaseMenu {
	render(ctx: MenuContext) {
		return { content: 'root', components: [ctx.row(ctx.button('ok', 'OK'))] };
	}

	@Button('ok')
	ok() {}

	@Button('boom')
	boom() {
		throw new Error('kaboom');
	}

	@Button('nope')
	nope() {
		throw new UserError('Không được');
	}
}

type Line = Record<string, unknown>;

function setup(options: { disableExpired?: boolean } = {}) {
	const lines: Line[] = [];
	setLogger(createLogger({ level: 'debug' }, { write: (s: string) => void lines.push(JSON.parse(s) as Line) } as never));
	const sessions = new MemorySessionStore();
	const onError = vi.fn();
	const router = new Router(menuRegistry, sessions, [], { onError, ...options });
	return { lines, router, onError, session: sessions.create('u1', 'o-root'), sessions };
}

const find = (lines: Line[], msg: string) => lines.find((l) => l['msg'] === msg);
const staleMessage = {
	components: [{ type: 1, components: [{ type: 2, custom_id: 'km:deadbeef:o-root:ok', label: 'OK' }] }],
};

describe('logging', () => {
	it('logs requestId, menu, action, user and duration for each interaction', async () => {
		const { lines, router, session } = setup();
		await router.handle(fakeClick(session.id, 'o-root', 'ok') as never);
		const l = find(lines, 'interaction handled')!;
		expect(l).toMatchObject({ menuId: 'o-root', action: 'ok', userId: 'u1', outcome: 'ok' });
		expect(l['requestId']).toMatch(/^[0-9a-f]{8}$/);
		expect(typeof l['durationMs']).toBe('number');
	});

	it('logs unexpected errors with the same requestId and tells the user', async () => {
		const { lines, router, session, onError } = setup();
		const i = fakeClick(session.id, 'o-root', 'boom');
		await router.handle(i as never);
		const err = find(lines, 'handler failed')!;
		const summary = find(lines, 'interaction handled')!;
		expect((err['err'] as { message: string }).message).toBe('kaboom');
		expect(err['requestId']).toBe(summary['requestId']);
		expect(summary['outcome']).toBe('error');
		expect(onError).toHaveBeenCalledOnce();
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Có lỗi') }));
	});

	it('treats UserError as a rejection, not an error', async () => {
		const { lines, router, session, onError } = setup();
		const i = fakeClick(session.id, 'o-root', 'nope');
		await router.handle(i as never);
		expect(find(lines, 'interaction handled')).toMatchObject({ outcome: 'rejected' });
		expect(find(lines, 'handler failed')).toBeUndefined();
		expect(onError).not.toHaveBeenCalled();
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Không được' }));
	});

	it('gives concurrent interactions different requestIds', async () => {
		const { lines, router, session } = setup();
		await Promise.all([
			router.handle(fakeClick(session.id, 'o-root', 'ok', { userId: 'u1' }) as never),
			router.handle(fakeClick('deadbeef', 'o-root', 'ok', { userId: 'u9' }) as never),
		]);
		const ids = lines.filter((l) => l['msg'] === 'interaction handled').map((l) => l['requestId']);
		expect(new Set(ids).size).toBe(2);
	});
});

describe('expired menus', () => {
	const reopenId = (call: unknown) =>
		((call as { components: { toJSON(): { components: { custom_id: string }[] } }[] }).components[0]!.toJSON().components[0]!.custom_id);

	it('grays out the stale message and offers a reopen button', async () => {
		const { router } = setup();
		const i = fakeClick('deadbeef', 'o-root', 'ok', { message: staleMessage });
		await router.handle(i as never);
		expect(i.update).toHaveBeenCalledWith({
			components: [{ type: 1, components: [expect.objectContaining({ custom_id: 'km:deadbeef:o-root:ok', disabled: true })] }],
		});
		expect(i.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('hết hạn') }));
		expect(reopenId(i.followUp.mock.calls[0]![0])).toBe('km:-:~:open');
	});

	it('only replies when disableExpired is false', async () => {
		const { router } = setup({ disableExpired: false });
		const i = fakeClick('deadbeef', 'o-root', 'ok', { message: staleMessage });
		await router.handle(i as never);
		expect(i.update).not.toHaveBeenCalled();
		expect(reopenId(i.reply.mock.calls[0]![0])).toBe('km:-:~:open');
	});

	it("does not disable someone else's menu", async () => {
		const { router, session } = setup();
		const i = fakeClick(session.id, 'o-root', 'ok', { userId: 'u2', message: staleMessage });
		await router.handle(i as never);
		expect(i.update).not.toHaveBeenCalled();
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('không phải') }));
	});

	it('the reopen button starts a fresh menu for the clicker', async () => {
		const { router } = setup();
		const i = fakeClick('-', '~', 'open', { userId: 'u3' });
		await router.handle(i as never);
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'root' }));
	});
});
