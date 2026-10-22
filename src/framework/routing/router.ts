import {
	MessageFlags,
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type ModalSubmitInteraction,
} from 'discord.js';
import { container } from '../core/container.js';
import { MenuContext, type MenuInteraction } from '../menu/context.js';
import { decodeCustomId, type DecodedCustomId } from './custom-id.js';
import type { HandlerKind, MenuDef } from '../core/decorators.js';
import { InteractionGuard } from './guard.js';
import type { MenuView } from '../menu/menu.js';
import { runMiddleware, UserError, type Middleware } from '../middleware/middleware.js';
import { Nav } from '../menu/nav.js';
import { PAGE_ACTION, pageStateKey } from '../menu/paginate.js';
import type { Session, SessionStore } from '../session/session.js';

export type HandledInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface RouterOptions {
	/** open menus as ephemeral messages (only the opener sees them) */
	ephemeral?: boolean;
	onError?: (error: unknown) => void;
	messages?: { expired: string; notOwner: string; error: string };
	/** duplicate-id / concurrent-click protection; defaults to an in-memory guard */
	guard?: InteractionGuard;
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
	private readonly guard: InteractionGuard;

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
		this.guard = options.guard ?? new InteractionGuard();
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
		if (!decoded || !this.guard.claim(interaction.id)) return;
		try {
			// one handler at a time per session; extra clicks are acked and dropped (double-click)
			const ran = await this.guard.exclusive(decoded.sessionId, () => this.dispatch(interaction, decoded));
			if (!ran) await interaction.deferUpdate().catch(() => undefined);
		} catch (e) {
			await this.fail(interaction, e);
		}
	}

	private async dispatch(i: HandledInteraction, d: DecodedCustomId): Promise<void> {
		const session = await this.sessions.get(d.sessionId);
		if (!session) return this.reply(i, this.messages.expired);
		if (session.ownerId !== i.user.id) return this.reply(i, this.messages.notOwner);

		if (i.isButton() && d.action === PAGE_ACTION) {
			turnPage(session, d.args);
			return this.apply(i, session, Nav.stay());
		}

		const def = this.menus.get(d.menuId);
		const kind = kindOf(i);
		const handler = def?.handlers.find((h) => h.kind === kind && h.id === d.action);
		if (!def || !handler) throw new Error(`No @${kind} handler "${d.action}" on menu "${d.menuId}"`);

		if (handler.slow) await i.deferUpdate(); // beat Discord's 3s deadline; result goes out via editReply
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
				if (i.deferred || i.replied) throw new Error('Nav.modal needs an unacknowledged interaction (remove slow: true)');
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

	/** Edit the menu message in place: `editReply` after a defer, `update` otherwise. */
	private async update(i: HandledInteraction, view: MenuView): Promise<void> {
		if (i.deferred || i.replied) await i.editReply(view);
		else if (i.isModalSubmit() && !i.isFromMessage()) await i.reply(view);
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

/** Built-in `~page` action: args are `[key, 'prev' | 'next' | 'label']`; paginate() clamps on render. */
function turnPage(session: Session, args: readonly string[]): void {
	const [key, dir] = args;
	if (!key || (dir !== 'prev' && dir !== 'next')) return;
	const k = pageStateKey(key);
	session.state[k] = (Number(session.state[k]) || 0) + (dir === 'next' ? 1 : -1);
}
