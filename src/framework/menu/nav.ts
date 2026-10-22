import type { ModalBuilder } from 'discord.js';

/** What a handler wants to happen next. Returning nothing means `Nav.stay()`. */
export type Nav =
	| { type: 'stay' }
	| { type: 'to'; menuId: string; args: string[] }
	| { type: 'back' }
	| { type: 'close' }
	| { type: 'modal'; modal: ModalBuilder };

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
};
