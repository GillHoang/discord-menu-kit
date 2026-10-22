import {
	MessageFlags,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type InteractionReplyOptions,
} from 'discord.js';
import type { HandlerKind, MenuDef } from '../core/decorators.js';
import { getLogger, runWithRequest } from '../logging/logger.js';
import { CONFIRM_MENU, ConfirmMenu } from '../menu/confirm.js';
import type { MenuInteraction } from '../menu/context.js';
import { Nav } from '../menu/nav.js';
import { PAGE_ACTION, turnPage } from '../menu/paginate.js';
import type { NormalizedView } from '../menu/view.js';
import { WIZARD_ACTION } from '../menu/wizard.js';
import { UserError, type Middleware } from '../middleware/middleware.js';
import type { Session, SessionStore } from '../session/session.js';
import { handleConfirm, handleWizard, type BuiltinDeps } from './builtin-actions.js';
import { decodeCustomId, type DecodedCustomId } from './custom-id.js';
import { disableStaleMessage, isReopen, reopenRow } from './expiry.js';
import { InteractionGuard } from './guard.js';
import { HandlerRunner } from './handler-runner.js';
import { Navigator } from './navigator.js';
import { Presenter, type HandledInteraction } from './presenter.js';

export type { HandledInteraction };

export interface RouterMessages {
	expired: string;
	notOwner: string;
	error: string;
	reopen: string;
	/** shown instead of an empty message when a Components V2 menu is closed */
	closed: string;
}

export interface RouterOptions {
	/** open menus as ephemeral messages (only the opener sees them) */
	ephemeral?: boolean;
	/** extra hook for unexpected errors (they are always logged as well) */
	onError?: (error: unknown) => void;
	messages?: Partial<RouterMessages>;
	/** duplicate-id / concurrent-click protection; defaults to an in-memory guard */
	guard?: InteractionGuard;
	/** defer automatically when a handler is still running after N ms (false = off; such handlers cannot return Nav.modal) */
	autoDefer?: number | false;
	/** gray out the buttons of an expired menu message when someone clicks it (default true) */
	disableExpired?: boolean;
}

const DEFAULT_MESSAGES: RouterMessages = {
	expired: 'Menu đã hết hạn, hãy mở menu mới.',
	notOwner: 'Đây không phải menu của bạn, hãy mở menu riêng.',
	error: 'Có lỗi xảy ra, thử lại sau nhé.',
	reopen: 'Mở lại menu',
	closed: 'Menu đã đóng.',
};

type Outcome = 'ok' | 'rejected' | 'ignored' | 'error';

/** Slash command → open root menu; component/modal interaction → find handler → apply `Nav`. */
export class Router {
	private readonly menus = new Map<string, MenuDef>();
	private readonly rootId: string;
	private readonly messages: RouterMessages;
	private readonly guard: InteractionGuard;
	private readonly deps: BuiltinDeps;
	private readonly presenter: Presenter;

	constructor(
		defs: readonly MenuDef[],
		private readonly sessions: SessionStore,
		middleware: readonly Middleware[] = [],
		private readonly options: RouterOptions = {},
	) {
		for (const d of defs) this.menus.set(d.id, d);
		this.menus.set(CONFIRM_MENU, { id: CONFIRM_MENU, ctor: ConfirmMenu, root: false, handlers: [] });
		const roots = defs.filter((d) => d.root);
		if (roots.length !== 1) throw new Error(`Exactly one @Menu(id, { root: true }) is required, found ${roots.length}`);
		this.rootId = roots[0]!.id;
		this.messages = { ...DEFAULT_MESSAGES, ...options.messages };
		this.guard = options.guard ?? new InteractionGuard();
		this.presenter = new Presenter(this.menus, this.messages.closed);
		const navigator = new Navigator(this.menus, sessions, this.presenter);
		this.deps = {
			menus: this.menus,
			navigator,
			runner: new HandlerRunner(middleware, navigator, options.autoDefer ?? false),
		};
	}

	async open(interaction: ChatInputCommandInteraction): Promise<void> {
		await runWithRequest(
			{ interactionId: interaction.id, userId: interaction.user.id, guildId: interaction.guildId, menuId: this.rootId, action: 'open' },
			async () => {
				try {
					await this.openMenu(interaction);
				} catch (e) {
					await this.fail(interaction, e);
				}
			},
		);
	}

	async handle(interaction: HandledInteraction): Promise<void> {
		const decoded = decodeCustomId(interaction.customId);
		if (!decoded) return;
		await runWithRequest(
			{
				interactionId: interaction.id,
				userId: interaction.user.id,
				guildId: interaction.guildId,
				menuId: decoded.menuId,
				action: decoded.action,
			},
			async () => {
				const log = getLogger();
				if (!this.guard.claim(interaction.id)) {
					log.debug('duplicate interaction ignored');
					return;
				}
				const started = performance.now();
				let outcome = 'ok' as Outcome;
				try {
					if (isReopen(decoded)) await this.openMenu(interaction);
					else {
						// one handler at a time per session; extra clicks are acked and dropped (double-click)
						const ran = await this.guard.exclusive(decoded.sessionId, async () => {
							outcome = await this.dispatch(interaction, decoded);
						});
						if (!ran) {
							outcome = 'ignored';
							await interaction.deferUpdate().catch(() => undefined);
						}
					}
				} catch (e) {
					outcome = e instanceof UserError ? 'rejected' : 'error';
					await this.fail(interaction, e);
				}
				const fields = { outcome, durationMs: Math.round(performance.now() - started) };
				if (outcome === 'ok') log.info(fields, 'interaction handled');
				else if (outcome === 'error') log.error(fields, 'interaction handled');
				else log.warn(fields, 'interaction handled');
			},
		);
	}

	/** New session + first render, sent as a new message (slash command or "reopen" button). */
	private async openMenu(i: MenuInteraction): Promise<void> {
		const session = await this.sessions.create(i.user.id, this.rootId);
		const view = await this.presenter.renderTop(i, session, true);
		await this.sessions.save(session);
		await (i as ChatInputCommandInteraction).reply(this.asReply(view));
		getLogger().info({ sessionId: session.id }, 'menu opened');
	}

	private async dispatch(i: HandledInteraction, d: DecodedCustomId): Promise<Outcome> {
		const session = await this.sessions.get(d.sessionId);
		if (!session) {
			if (this.options.disableExpired !== false) await disableStaleMessage(i);
			await this.ephemeral(i, this.messages.expired, true);
			return 'rejected';
		}
		if (session.ownerId !== i.user.id) {
			await this.ephemeral(i, this.messages.notOwner, true);
			return 'rejected';
		}
		return this.route(i, session, d);
	}

	private async route(i: HandledInteraction, session: Session, d: DecodedCustomId): Promise<Outcome> {
		if (d.menuId === CONFIRM_MENU) {
			await handleConfirm(this.deps, i, session, d);
			return 'ok';
		}
		const def = this.menus.get(d.menuId);
		if (i.isButton() && d.action === PAGE_ACTION) {
			turnPage(session.state, d.args);
			await this.deps.navigator.apply(i, session, Nav.stay());
			return 'ok';
		}
		if (i.isButton() && d.action === WIZARD_ACTION) {
			await handleWizard(this.deps, i, session, def, d);
			return 'ok';
		}
		const kind = kindOf(i);
		const handler = def?.handlers.find((h) => h.kind === kind && h.id === d.action);
		if (!def || !handler) throw new Error(`No @${kind} handler "${d.action}" on menu "${d.menuId}"`);
		await this.deps.runner.run(i, session, def, handler, d.args);
		return 'ok';
	}

	private asReply(view: NormalizedView): InteractionReplyOptions {
		const flags = (view.flags ?? 0) | (this.options.ephemeral ? MessageFlags.Ephemeral : 0);
		return (flags ? { ...view, flags } : view) as InteractionReplyOptions;
	}

	private async ephemeral(i: MenuInteraction, content: string, reopen = false): Promise<void> {
		const payload = {
			content,
			flags: MessageFlags.Ephemeral,
			...(reopen ? { components: [reopenRow(this.messages.reopen)] } : {}),
		} as const;
		if (i.replied || i.deferred) await (i as ButtonInteraction).followUp(payload);
		else await (i as ButtonInteraction).reply(payload);
	}

	private async fail(i: MenuInteraction, error: unknown): Promise<void> {
		const expected = error instanceof UserError;
		if (!expected) {
			getLogger().error({ err: error }, 'handler failed');
			this.options.onError?.(error);
		}
		await this.ephemeral(i, expected ? error.message : this.messages.error).catch(() => undefined);
	}
}

function kindOf(i: HandledInteraction): HandlerKind {
	if (i.isModalSubmit()) return 'modal';
	return i.isButton() ? 'button' : 'select';
}
