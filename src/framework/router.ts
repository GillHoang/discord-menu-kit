import {
	MessageFlags,
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type ModalSubmitInteraction,
} from 'discord.js';
import { container } from './container.js';
import { MenuContext, type MenuInteraction } from './context.js';
import { decodeCustomId, type DecodedCustomId } from './custom-id.js';
import type { HandlerKind, MenuDef } from './decorators.js';
import type { MenuView } from './menu.js';
import { runMiddleware, UserError, type Middleware } from './middleware.js';
import { Nav } from './nav.js';
import type { Session, SessionStore } from './session.js';

export type HandledInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface RouterOptions {
	/** open menus as ephemeral messages (only the opener sees them) */
	ephemeral?: boolean;
	onError?: (error: unknown) => void;
	messages?: { expired: string; notOwner: string; error: string };
}

const DEFAULT_MESSAGES = {
	expired: 'Menu đã hết hạn, hãy dùng lại lệnh để mở menu mới.',
	notOwner: 'Đây không phải menu của bạn, hãy dùng lệnh để mở menu riêng.',
	error: 'Có lỗi xảy ra, thử lại sau nhé.',
};

/** Slash command → open root menu; component/modal interaction → find handler → apply `Nav`. */
export class Router {
	private readonly menus = new Map<string, MenuDef>();
	private readonly rootId: string;
	private readonly messages: typeof DEFAULT_MESSAGES;

	constructor(
		defs: readonly MenuDef[],
		private readonly sessions: SessionStore,
		private readonly middleware: readonly Middleware[] = [],
		private readonly options: RouterOptions = {},
	) {
		for (const d of defs) this.menus.set(d.id, d);
		const roots = defs.filter((d) => d.root);
		if (roots.length !== 1) throw new Error(`Exactly one @Menu(id, { root: true }) is required, found ${roots.length}`);
		this.rootId = roots[0]!.id;
		this.messages = options.messages ?? DEFAULT_MESSAGES;
	}

	async open(interaction: ChatInputCommandInteraction): Promise<void> {
		try {
			const session = await this.sessions.create(interaction.user.id, this.rootId);
			const view = await this.renderTop(interaction, session, true);
			await this.sessions.save(session);
			await interaction.reply(this.options.ephemeral ? { ...view, flags: MessageFlags.Ephemeral } : view);
		} catch (e) {
			await this.fail(interaction, e);
		}
	}

	async handle(interaction: HandledInteraction): Promise<void> {
		const decoded = decodeCustomId(interaction.customId);
		if (!decoded) return;
		try {
			await this.dispatch(interaction, decoded);
		} catch (e) {
			await this.fail(interaction, e);
		}
	}

	private async dispatch(i: HandledInteraction, d: DecodedCustomId): Promise<void> {
		const session = await this.sessions.get(d.sessionId);
		if (!session) return this.reply(i, this.messages.expired);
		if (session.ownerId !== i.user.id) return this.reply(i, this.messages.notOwner);

		const def = this.menus.get(d.menuId);
		const kind = kindOf(i);
		const handler = def?.handlers.find((h) => h.kind === kind && h.id === d.action);
		if (!def || !handler) throw new Error(`No @${kind} handler "${d.action}" on menu "${d.menuId}"`);

		const ctx = new MenuContext(i, session, d.menuId, d.args);
		let nav: Nav = Nav.stay();
		await runMiddleware(this.middleware, ctx, { menuId: d.menuId, handler }, async () => {
			const menu = container.get(def.ctor) as unknown as Record<string, (c: MenuContext) => Nav | void | Promise<Nav | void>>;
			nav = (await menu[handler.method]!(ctx)) ?? Nav.stay();
		});
		await this.apply(i, session, nav);
	}

	private async apply(i: HandledInteraction, session: Session, nav: Nav): Promise<void> {
		switch (nav.type) {
			case 'modal':
				if (i.isModalSubmit()) throw new Error('A modal cannot open another modal');
				await i.showModal(nav.modal);
				return;
			case 'close':
				await this.sessions.delete(session.id);
				await this.update(i, { components: [] });
				return;
			case 'to':
				if (!this.menus.has(nav.menuId)) throw new Error(`Unknown menu "${nav.menuId}"`);
				session.stack.push({ menuId: nav.menuId, args: nav.args });
				break;
			case 'back':
				if (session.stack.length > 1) session.stack.pop();
				break;
			case 'stay':
				break;
		}
		const view = await this.renderTop(i, session, nav.type === 'to' || nav.type === 'back');
		await this.sessions.save(session);
		await this.update(i, view);
	}

	private async renderTop(i: MenuInteraction, session: Session, enter: boolean): Promise<MenuView> {
		const top = session.stack.at(-1)!;
		const def = this.menus.get(top.menuId);
		if (!def) throw new Error(`Unknown menu "${top.menuId}"`);
		const ctx = new MenuContext(i, session, top.menuId, top.args);
		const menu = container.get(def.ctor);
		if (enter) await menu.onEnter?.(ctx);
		return menu.render(ctx);
	}

	/** Edit the menu message in place (modal submits that did not come from a message get a new reply). */
	private async update(i: HandledInteraction, view: MenuView): Promise<void> {
		if (i.isModalSubmit() && !i.isFromMessage()) await i.reply(view);
		else await (i as ButtonInteraction).update(view);
	}

	private async reply(i: MenuInteraction, content: string): Promise<void> {
		if (i.replied || i.deferred) await i.followUp({ content, flags: MessageFlags.Ephemeral });
		else await i.reply({ content, flags: MessageFlags.Ephemeral });
	}

	private async fail(i: MenuInteraction, error: unknown): Promise<void> {
		const message = error instanceof UserError ? error.message : this.messages.error;
		if (!(error instanceof UserError)) (this.options.onError ?? console.error)(error);
		await this.reply(i, message).catch(() => undefined);
	}
}

function kindOf(i: HandledInteraction): HandlerKind {
	if (i.isModalSubmit()) return 'modal';
	return i.isButton() ? 'button' : 'select';
}
