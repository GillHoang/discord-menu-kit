import { describe, expect, it } from 'vitest';
import {
	BaseMenu,
	Button,
	Menu,
	MemorySessionStore,
	Router,
	cooldownMiddleware,
	permissionMiddleware,
	type MenuContext,
} from '../src/framework/index.js';
import { menuRegistry } from '../src/framework/core/decorators.js';
import { fakeClick } from './helpers/fake-interaction.js';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const calls = { slow: 0, hold: 0, ban: 0 };
let release: () => void = () => undefined;

@Menu('s-root', { root: true })
class SafetyMenu extends BaseMenu {
	render(ctx: MenuContext) {
		const p = ctx.paginate(ITEMS, { pageSize: 3 });
		return { content: `${p.items.join(',')} ${p.page + 1}/${p.pages}`, components: [p.row] };
	}

	@Button('slow', { slow: true })
	async slow() {
		calls.slow++;
		await new Promise((r) => setTimeout(r, 5));
	}

	@Button('hold')
	hold() {
		calls.hold++;
		return new Promise<void>((r) => (release = r));
	}

	@Button('ban', { permissions: ['BanMembers'] })
	ban() {
		calls.ban++;
	}

	@Button('vip', { roles: ['r1', 'r2'] })
	vip() {
		calls.ban++;
	}

	@Button('guild', { guildOnly: true })
	guild() {
		calls.ban++;
	}
}

function setup() {
	const sessions = new MemorySessionStore();
	const router = new Router(menuRegistry, sessions, [permissionMiddleware, cooldownMiddleware()], {
		onError: () => undefined,
	});
	return { router, session: sessions.create('u1', 's-root') };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('ack and dedupe', () => {
	it('defers slow handlers first and finishes with editReply', async () => {
		const { router, session } = setup();
		const i = fakeClick(session.id, 's-root', 'slow');
		await router.handle(i as never);
		expect(i.deferUpdate).toHaveBeenCalledOnce();
		expect(i.update).not.toHaveBeenCalled();
		expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(String) }));
	});

	it('ignores a redelivered interaction id', async () => {
		const { router, session } = setup();
		const before = calls.slow;
		const i = fakeClick(session.id, 's-root', 'slow');
		await router.handle(i as never);
		await router.handle(i as never);
		expect(calls.slow - before).toBe(1);
	});

	it('acks and drops a second click while the first handler is running', async () => {
		const { router, session } = setup();
		const before = calls.hold;
		const first = fakeClick(session.id, 's-root', 'hold');
		const running = router.handle(first as never);
		await flush();
		const second = fakeClick(session.id, 's-root', 'hold');
		await router.handle(second as never);
		expect(second.deferUpdate).toHaveBeenCalledOnce();
		expect(calls.hold - before).toBe(1);
		release();
		await running;
		expect(first.update).toHaveBeenCalled();
	});
});

describe('permissions', () => {
	it('rejects members without the required permission', async () => {
		const { router, session } = setup();
		const before = calls.ban;
		const i = fakeClick(session.id, 's-root', 'ban');
		await router.handle(i as never);
		expect(calls.ban).toBe(before);
		expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('quyền') }));
	});

	it('allows members that have it', async () => {
		const { router, session } = setup();
		const before = calls.ban;
		await router.handle(fakeClick(session.id, 's-root', 'ban', { permissions: ['BanMembers'] }) as never);
		expect(calls.ban).toBe(before + 1);
	});

	it('checks roles (any of) and guildOnly', async () => {
		const { router, session } = setup();
		const before = calls.ban;
		await router.handle(fakeClick(session.id, 's-root', 'vip', { roles: ['r2'] }) as never);
		await router.handle(fakeClick(session.id, 's-root', 'vip', { roles: ['x'] }) as never);
		const dm = fakeClick(session.id, 's-root', 'guild', { guildId: null });
		await router.handle(dm as never);
		expect(calls.ban).toBe(before + 1);
		expect(dm.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('server') }));
	});
});

describe('pagination', () => {
	it('turns pages through the built-in action and clamps at the ends', async () => {
		const { router, session } = setup();
		const page = (dir: string) => fakeClick(session.id, 's-root', '~page', { args: ['default', dir] });
		const next = page('next');
		await router.handle(next as never);
		expect(next.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'd,e,f 2/3' }));
		await router.handle(page('next') as never);
		const last = page('next');
		await router.handle(last as never);
		expect(last.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'g 3/3' }));
		const prev = page('prev');
		await router.handle(prev as never);
		expect(prev.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'd,e,f 2/3' }));
	});
});
