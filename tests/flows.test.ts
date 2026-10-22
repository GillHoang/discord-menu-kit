import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
	BaseMenu,
	Button,
	MemorySessionStore,
	Menu,
	Modal,
	Nav,
	Router,
	WizardMenu,
	type MenuContext,
	type WizardStep,
} from '../src/framework/index.js';
import { menuRegistry } from '../src/framework/core/decorators.js';
import { fakeClick } from './helpers/fake-interaction.js';

const deleted: string[] = [];
const finished: unknown[] = [];

type Draft = { name?: string };

@Menu('f-root', { root: true })
class FlowRoot extends BaseMenu {
	render(ctx: MenuContext) {
		return { content: 'root', components: [ctx.row(ctx.button('ask', 'Xóa'))] };
	}

	@Button('ask')
	ask() {
		return Nav.confirm({ message: 'Chắc chứ?', onYes: 'remove', args: ['7'] });
	}

	@Button('remove')
	remove(ctx: MenuContext) {
		deleted.push(ctx.args[0]!);
	}

	@Button('bad-confirm')
	badConfirm() {
		return Nav.confirm({ message: 'x', onYes: 'does-not-exist' });
	}

	@Button('wiz')
	wiz() {
		return Nav.to('f-wiz');
	}

	@Button('sluggish')
	async sluggish() {
		await new Promise((r) => setTimeout(r, 60));
	}
}

@Menu('f-wiz')
class FlowWizard extends WizardMenu<Draft> {
	readonly steps: readonly WizardStep<Draft>[] = [
		{
			id: 'name',
			title: 'Tên',
			render: (ctx, d) => ({ content: `tên: ${d.name ?? '-'}`, components: [ctx.row(ctx.button('rename', 'Nhập'))] }),
			validate: (d) => (d.name ? null : 'Cần nhập tên'),
		},
		{ id: 'done', title: 'Xác nhận', render: () => ({ content: 'xong?' }) },
	];

	@Button('rename')
	rename(ctx: MenuContext) {
		return Nav.modal(ctx.modal('setname', 'Tên', [{ id: 'name', label: 'Tên' }]));
	}

	@Modal('setname', { schema: z.object({ name: z.string().min(2, 'ít nhất 2 ký tự') }) })
	setName(ctx: MenuContext) {
		this.data(ctx).name = ctx.input<{ name: string }>().name;
	}

	onFinish(_ctx: MenuContext, data: Draft) {
		finished.push({ ...data });
	}
}

function setup(options: { autoDefer?: number } = {}) {
	const sessions = new MemorySessionStore();
	const onError = vi.fn();
	const router = new Router(menuRegistry, sessions, [], { onError, ...options });
	return { router, session: sessions.create('u1', 'f-root'), onError };
}

const stack = (s: { stack: { menuId: string }[] }) => s.stack.map((e) => e.menuId);

describe('Nav.confirm', () => {
	it('asks first, then runs the original handler with its args', async () => {
		const { router, session } = setup();
		const ask = fakeClick(session.id, 'f-root', 'ask');
		await router.handle(ask as never);
		expect(ask.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'Chắc chứ?' }));
		expect(stack(session)).toEqual(['f-root', '~confirm']);
		expect(deleted).toEqual([]);

		const yes = fakeClick(session.id, '~confirm', 'yes');
		await router.handle(yes as never);
		expect(deleted).toEqual(['7']);
		expect(yes.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'root' }));
		expect(stack(session)).toEqual(['f-root']);
	});

	it('goes back without running anything on "no"', async () => {
		const { router, session } = setup();
		deleted.length = 0;
		await router.handle(fakeClick(session.id, 'f-root', 'ask') as never);
		await router.handle(fakeClick(session.id, '~confirm', 'no') as never);
		expect(deleted).toEqual([]);
		expect(stack(session)).toEqual(['f-root']);
	});

	it('fails loudly when onYes points to a missing @Button', async () => {
		const { router, session, onError } = setup();
		const i = fakeClick(session.id, 'f-root', 'bad-confirm');
		await router.handle(i as never);
		expect(onError).toHaveBeenCalledOnce();
		expect(stack(session)).toEqual(['f-root']);
	});
});

describe('modal schema', () => {
	it('shows validation errors and does not call the handler', async () => {
		const { router, session } = setup();
		await router.handle(fakeClick(session.id, 'f-root', 'wiz') as never);
		const bad = fakeClick(session.id, 'f-wiz', 'setname', { modal: { name: 'x' } });
		await router.handle(bad as never);
		expect(bad.reply).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining('name: ít nhất 2 ký tự') }),
		);
		expect(bad.update).not.toHaveBeenCalled();
	});
});

describe('WizardMenu', () => {
	it('walks the steps, validates, and calls onFinish with the collected data', async () => {
		const { router, session } = setup();
		finished.length = 0;
		const go = fakeClick(session.id, 'f-root', 'wiz');
		await router.handle(go as never);
		expect(go.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Bước 1/2: Tên') }));

		const blocked = fakeClick(session.id, 'f-wiz', '~wiz', { args: ['next'] });
		await router.handle(blocked as never);
		expect(blocked.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Cần nhập tên' }));

		const ask = fakeClick(session.id, 'f-wiz', 'rename');
		await router.handle(ask as never);
		expect(ask.showModal).toHaveBeenCalledOnce();

		const set = fakeClick(session.id, 'f-wiz', 'setname', { modal: { name: 'Bo' } });
		await router.handle(set as never);
		expect(set.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('tên: Bo') }));

		const next = fakeClick(session.id, 'f-wiz', '~wiz', { args: ['next'] });
		await router.handle(next as never);
		expect(next.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Bước 2/2') }));

		const back = fakeClick(session.id, 'f-wiz', '~wiz', { args: ['back'] });
		await router.handle(back as never);
		expect(back.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Bước 1/2') }));

		await router.handle(fakeClick(session.id, 'f-wiz', '~wiz', { args: ['next'] }) as never);
		const done = fakeClick(session.id, 'f-wiz', '~wiz', { args: ['next'] });
		await router.handle(done as never);
		expect(finished).toEqual([{ name: 'Bo' }]);
		expect(done.update).toHaveBeenCalledWith({ components: [] });
	});

	it('cancel returns to the previous menu and forgets progress', async () => {
		const { router, session } = setup();
		await router.handle(fakeClick(session.id, 'f-root', 'wiz') as never);
		const cancel = fakeClick(session.id, 'f-wiz', '~wiz', { args: ['cancel'] });
		await router.handle(cancel as never);
		expect(cancel.update).toHaveBeenCalledWith(expect.objectContaining({ content: 'root' }));
		expect(session.state['wiz:f-wiz']).toBeUndefined();
	});
});

describe('autoDefer', () => {
	it('defers a handler that is still running after the threshold and finishes with editReply', async () => {
		const { router, session } = setup({ autoDefer: 20 });
		const i = fakeClick(session.id, 'f-root', 'sluggish');
		await router.handle(i as never);
		expect(i.deferUpdate).toHaveBeenCalledOnce();
		expect(i.editReply).toHaveBeenCalled();
		expect(i.update).not.toHaveBeenCalled();
	});

	it('leaves fast handlers alone', async () => {
		const { router, session } = setup({ autoDefer: 20 });
		const i = fakeClick(session.id, 'f-root', 'wiz');
		await router.handle(i as never);
		expect(i.deferUpdate).not.toHaveBeenCalled();
		expect(i.update).toHaveBeenCalled();
	});
});
