import { ButtonStyle } from 'discord.js';
import type { MenuContext } from './context.js';
import { BaseMenu, type MenuView } from './menu.js';
import { panel, text, v2 } from './view.js';

/** Built-in menu pushed by `Nav.confirm(...)`; the router handles its `yes` / `no` actions itself. */
export const CONFIRM_MENU = '~confirm';
export const CONFIRM_STATE_KEY = '~confirm';

export interface ConfirmState {
	message: string;
	/** menu whose `@Button(onYes)` runs after the user agrees */
	menuId: string;
	onYes: string;
	args: string[];
	yesLabel?: string;
	noLabel?: string;
}

export class ConfirmMenu extends BaseMenu {
	render(ctx: MenuContext): MenuView {
		const c = ctx.state[CONFIRM_STATE_KEY] as ConfirmState | undefined;
		const message = c?.message ?? 'Bạn chắc chứ?';
		const row = ctx.row(
			ctx.button('yes', c?.yesLabel ?? 'Đồng ý', { style: ButtonStyle.Danger }),
			ctx.button('no', c?.noLabel ?? 'Hủy'),
		);
		// a session is either all-classic or all-V2: a message cannot switch type once sent
		return ctx.state['~v2'] ? v2(panel([text(message), row])) : { content: message, components: [row] };
	}
}
