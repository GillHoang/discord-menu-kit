import {
	MessageFlags,
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type InteractionEditReplyOptions,
	type ModalSubmitInteraction,
} from 'discord.js';
import { container } from '../core/container.js';
import type { MenuDef } from '../core/decorators.js';
import { MenuContext, type MenuInteraction } from '../menu/context.js';
import { isV2View, normalizeView, text, type NormalizedView } from '../menu/view.js';
import type { Session } from '../session/session.js';

export type HandledInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/** Renders the menu on top of a session's stack and writes it back to Discord. */
export class Presenter {
	constructor(
		private readonly menus: ReadonlyMap<string, MenuDef>,
		private readonly closedText: string,
	) {}

	async renderTop(i: MenuInteraction, session: Session, enter: boolean): Promise<NormalizedView> {
		const top = session.stack.at(-1);
		const def = top && this.menus.get(top.menuId);
		if (!top || !def) throw new Error(`Unknown menu "${top?.menuId}"`);
		const ctx = new MenuContext(i, session, top.menuId, top.args);
		const menu = container.get(def.ctor);
		if (enter) await menu.onEnter?.(ctx);
		const view = normalizeView(await menu.render(ctx), top.menuId);
		session.state['~v2'] = isV2View(view);
		return view;
	}

	/** Edit the menu message in place: `editReply` after a defer, `update` otherwise. */
	async update(i: HandledInteraction, view: NormalizedView): Promise<void> {
		if (i.deferred || i.replied) await i.editReply(view as InteractionEditReplyOptions);
		else if (i.isModalSubmit() && !i.isFromMessage()) await i.reply(view as never);
		else await (i as ButtonInteraction).update(view as never);
	}

	/** Remove the buttons. A V2 message cannot be empty, so it gets a short closing text instead. */
	async close(i: HandledInteraction): Promise<void> {
		const flags = (i as { message?: { flags?: { has?: (f: number) => boolean } } | null }).message?.flags;
		const v2 = flags?.has?.(MessageFlags.IsComponentsV2) ?? false;
		await this.update(
			i,
			v2 ? { components: [text(this.closedText)], flags: MessageFlags.IsComponentsV2 } : { components: [] },
		);
	}
}
