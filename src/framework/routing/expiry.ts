import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
	type ButtonInteraction,
	type Message,
} from 'discord.js';
import { disableAll } from '../menu/view.js';
import { encodeCustomId } from './custom-id.js';
import type { DecodedCustomId } from './custom-id.js';
import type { HandledInteraction } from './presenter.js';

/** Session id used by buttons that are not bound to a session (the "reopen menu" button). */
export const NO_SESSION = '-';
const REOPEN_MENU = '~';
const REOPEN_ACTION = 'open';

export const isReopen = (d: DecodedCustomId): boolean =>
	d.sessionId === NO_SESSION && d.menuId === REOPEN_MENU && d.action === REOPEN_ACTION;

/** Row with a single "open a new menu" button, attached to expired / not-your-menu replies. */
export function reopenRow(label: string): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeCustomId(NO_SESSION, REOPEN_MENU, REOPEN_ACTION))
			.setLabel(label)
			.setStyle(ButtonStyle.Primary),
	);
}

/**
 * Gray out the buttons of the stale menu message the user just clicked.
 * Acknowledges the interaction with `update` on success, so the caller must follow up (not reply).
 */
export async function disableStaleMessage(i: HandledInteraction): Promise<boolean> {
	const message = (i as { message?: Message | null }).message;
	if (!message) return false;
	try {
		const components = disableAll(message.components.map((c) => c.toJSON()));
		const v2 = message.flags.has(MessageFlags.IsComponentsV2);
		await (i as ButtonInteraction).update({
			components,
			...(v2 ? { flags: MessageFlags.IsComponentsV2 } : {}),
		} as never);
		return true;
	} catch {
		return false; // old message, missing permission…: the ephemeral notice still goes out
	}
}
