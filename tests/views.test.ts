import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
	BaseMenu,
	Button,
	MemorySessionStore,
	Menu,
	Nav,
	Router,
	panel,
	text,
	v2,
	type MenuContext,
} from '../src/framework/index.js';
import { menuRegistry } from '../src/framework/core/decorators.js';
import { countComponents, disableAll, normalizeView } from '../src/framework/menu/view.js';
import { fakeClick } from './helpers/fake-interaction.js';

const row = (...ids: string[]) =>
	new ActionRowBuilder<ButtonBuilder>().addComponents(
		ids.map((id) => new ButtonBuilder().setCustomId(id).setLabel(id).setStyle(ButtonStyle.Secondary)),
	);

@Menu('v-root', { root: true })
class V2Menu extends BaseMenu {
	render(ctx: MenuContext) {
		return v2(panel([text('xin chào'), ctx.row(ctx.button('again', 'Lại'), ctx.button('close', 'Đóng'))], 0x5865f2));
	}

	@Button('again')
	again() {}

	@Button('close')
	close() {
		return Nav.close();
	}
}

describe('normalizeView', () => {
	it('leaves classic views alone', () => {
		const view = { content: 'hi', components: [row('a')] };
		expect(normalizeView(view, 'm')).toBe(view);
	});

	it('flags V2 views and rejects content next to them', () => {
		expect(normalizeView(v2(panel([text('a')])), 'm').flags).toBe(MessageFlags.IsComponentsV2);
		expect(() => normalizeView({ ...v2(panel([text('a')])), content: 'x' }, 'm')).toThrow(/không được có: content/);
	});

	it('enforces the 40-component budget, nested components included', () => {
		const texts = (n: number) => Array.from({ length: n }, (_, i) => text(`t${i}`));
		expect(() => normalizeView(v2(panel(texts(39))), 'shop')).not.toThrow(); // container + 39 = 40
		expect(() => normalizeView(v2(panel(texts(40))), 'shop')).toThrow(/Menu "shop": 41 component/);
	});

	it('limits classic messages to 5 rows', () => {
		const rows = Array.from({ length: 6 }, (_, i) => row(`b${i}`));
		expect(() => normalizeView({ components: rows }, 'm')).toThrow(/tối đa 5/);
	});

	it('counts container, text, row and buttons', () => {
		expect(countComponents([panel([text('a'), row('x', 'y')]).toJSON()])).toBe(5);
	});
});

describe('disableAll', () => {
	it('disables buttons and selects at any depth but keeps link buttons', () => {
		const raw = [
			{ type: 17, components: [{ type: 1, components: [{ type: 2, custom_id: 'a' }, { type: 2, url: 'https://x.y' }] }] },
			{ type: 1, components: [{ type: 3, custom_id: 's', options: [{ label: 'l', value: 'v' }] }] },
		];
		const out = disableAll(raw);
		expect(JSON.stringify(out)).toBe(
			JSON.stringify([
				{ type: 17, components: [{ type: 1, components: [{ type: 2, custom_id: 'a', disabled: true }, { type: 2, url: 'https://x.y' }] }] },
				{ type: 1, components: [{ type: 3, custom_id: 's', options: [{ label: 'l', value: 'v' }], disabled: true }] },
			]),
		);
		expect(raw[1]!.components[0]).not.toHaveProperty('disabled'); // input untouched
	});
});

describe('V2 menus through the router', () => {
	const setup = () => {
		const sessions = new MemorySessionStore();
		return { router: new Router(menuRegistry, sessions), session: sessions.create('u1', 'v-root') };
	};

	it('sends the IsComponentsV2 flag on every update', async () => {
		const { router, session } = setup();
		const i = fakeClick(session.id, 'v-root', 'again');
		await router.handle(i as never);
		expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }));
	});

	it('closing a V2 message replaces it with a text display instead of an empty message', async () => {
		const { router, session } = setup();
		const i = fakeClick(session.id, 'v-root', 'close', { message: { components: [], v2: true } });
		await router.handle(i as never);
		const arg = i.update.mock.calls[0]![0] as { components: unknown[]; flags: number };
		expect(arg.flags).toBe(MessageFlags.IsComponentsV2);
		expect(arg.components).toHaveLength(1);
	});

	it('closing a classic message just removes the components', async () => {
		const sessions = new MemorySessionStore();
		const router = new Router(menuRegistry, sessions);
		const session = sessions.create('u1', 'v-root');
		const i = fakeClick(session.id, 'v-root', 'close', { message: { components: [], v2: false } });
		await router.handle(i as never);
		expect(i.update).toHaveBeenCalledWith({ components: [] });
	});
});
