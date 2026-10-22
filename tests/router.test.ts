import { describe, expect, it } from 'vitest';
import {
	BaseMenu,
	Button,
	Inject,
	Menu,
	MemorySessionStore,
	Nav,
	Router,
	Service,
	cooldownMiddleware,
	type MenuContext,
} from '../src/framework/index.js';
import { menuRegistry } from '../src/framework/decorators.js';
import { fakeClick } from './helpers/fake-interaction.js';

@Service()
class Counter {
	n = 0;
}

@Menu('t-root', { root: true })
class RootMenu extends BaseMenu {
	@Inject(Counter) private readonly counter!: Counter;

	render(ctx: MenuContext) {
		return { content: `n=${this.counter.n} args=${ctx.args.join(',')}`, components: [ctx.row(ctx.button('inc', '+'))] };
	}

	@Button('inc', { cooldownMs: 1000 })
	inc() {
		this.counter.n++;
	}

	@Button('go')
	go() {
		return Nav.to('t-child', 'x');
	}
}

@Menu('t-child')
class ChildMenu extends BaseMenu {
	render() {
		return { content: 'child' };
	}

	@Button('back')
	back() {
		return Nav.back();
	}
}

function setup() {
	const sessions = new MemorySessionStore();
	const router = new Router(menuRegistry, sessions, [cooldownMiddleware()], { onError: () => undefined });
	const session = sessions.create('u1', 't-root');
	return { router, sessions, session };
}

describe('Router', () => {
	it('runs the handler, re-renders and updates the message', async () => {
		const { router, session } = setup();
		const i = fakeClick(session.id, 't-root', 'inc');
		await router.handle(i as never);
		expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringMatching(/^n=1 /) }));
	});

	it('pushes and pops menus with Nav.to / Nav.back', async () => {
		const { router, session } = setup();
		const go = fakeClick(session.id, 't-root', 'go');
		await router.handle(go as never);
		expect(go.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'child' }));
		const back = fakeClick(session.id, 't-child', 'back');
		await router.handle(back as never);
		expect(back.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('n=') }));
	});

	it('rejects other users and expired sessions', async () => {
		const { router, session } = setup();
		const foreign = fakeClick(session.id, 't-root', 'inc', { userId: 'u2' });
		await router.handle(foreign as never);
		expect(foreign.update).not.toHaveBeenCalled();
		expect(foreign.reply).toHaveBeenCalled();

		const expired = fakeClick('deadbeef', 't-root', 'inc');
		await router.handle(expired as never);
		expect(expired.reply).toHaveBeenCalled();
	});

	it('enforces handler cooldown through middleware', async () => {
		const { router, session } = setup();
		await router.handle(fakeClick(session.id, 't-root', 'inc') as never);
		const second = fakeClick(session.id, 't-root', 'inc');
		await router.handle(second as never);
		expect(second.update).not.toHaveBeenCalled();
		expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('thử lại') }));
	});
});
