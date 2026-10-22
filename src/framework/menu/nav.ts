import type { ModalBuilder } from 'discord.js';

export interface ConfirmOptions {
	message: string;
	/** `@Button(onYes)` of the current menu; runs (with `args`) only after the user agrees */
	onYes: string;
	args?: string[];
	yesLabel?: string;
	noLabel?: string;
}

/** What a handler wants to happen next. Returning nothing means `Nav.stay()`. */
export type Nav =
	| { type: 'stay' }
	| { type: 'to'; menuId: string; args: string[] }
	| { type: 'back' }
	| { type: 'close' }
	| { type: 'modal'; modal: ModalBuilder }
	| { type: 'confirm'; message: string; onYes: string; args: string[]; yesLabel?: string; noLabel?: string };

export const Nav = {
	/** Re-render the current menu (state may have changed). */
	stay: (): Nav => ({ type: 'stay' }),
	/** Push another menu on the session stack. */
	to: (menuId: string, ...args: string[]): Nav => ({ type: 'to', menuId, args }),
	/** Pop to the previous menu (no-op at the root). */
	back: (): Nav => ({ type: 'back' }),
	/** Remove the buttons and end the session. */
	close: (): Nav => ({ type: 'close' }),
	/** Show a modal; its submit is routed to the `@Modal(action)` handler of the same menu. */
	modal: (modal: ModalBuilder): Nav => ({ type: 'modal', modal }),
	/** "Are you sure?" step; `@Button(onYes)` runs only if the user agrees, "no" goes back. */
	confirm: (o: ConfirmOptions): Nav => ({
		type: 'confirm',
		message: o.message,
		onYes: o.onYes,
		args: o.args ?? [],
		...(o.yesLabel ? { yesLabel: o.yesLabel } : {}),
		...(o.noLabel ? { noLabel: o.noLabel } : {}),
	}),
};
