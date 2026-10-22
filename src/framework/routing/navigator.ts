import type { MenuDef } from '../core/decorators.js';
import { CONFIRM_MENU, CONFIRM_STATE_KEY, type ConfirmState } from '../menu/confirm.js';
import type { Nav } from '../menu/nav.js';
import { assertAccess } from '../middleware/permissions.js';
import type { Session, SessionStore } from '../session/session.js';
import type { HandledInteraction, Presenter } from './presenter.js';

/** Applies the `Nav` a handler returned: mutate the session stack, re-render, save, edit the message. */
export class Navigator {
	constructor(
		private readonly menus: ReadonlyMap<string, MenuDef>,
		private readonly sessions: SessionStore,
		private readonly presenter: Presenter,
	) {}

	async apply(i: HandledInteraction, session: Session, nav: Nav): Promise<void> {
		switch (nav.type) {
			case 'modal':
				if (i.isModalSubmit()) throw new Error('A modal cannot open another modal');
				if (i.deferred || i.replied) throw new Error('Nav.modal needs an unacknowledged interaction (remove slow / autoDefer)');
				await i.showModal(nav.modal);
				return;
			case 'close':
				await this.sessions.delete(session.id);
				await this.presenter.close(i);
				return;
			case 'to': {
				const target = this.menus.get(nav.menuId);
				if (!target) throw new Error(`Unknown menu "${nav.menuId}"`);
				assertAccess(i, target); // before touching the stack, so a refused jump leaves the session intact
				session.stack.push({ menuId: nav.menuId, args: nav.args });
				break;
			}
			case 'back':
				if (session.stack.length > 1) session.stack.pop();
				break;
			case 'confirm':
				this.pushConfirm(session, nav);
				break;
			case 'stay':
				break;
		}
		const view = await this.presenter.renderTop(i, session, nav.type !== 'stay');
		await this.sessions.save(session);
		await this.presenter.update(i, view);
	}

	private pushConfirm(session: Session, nav: Extract<Nav, { type: 'confirm' }>): void {
		const top = session.stack.at(-1);
		const def = top && this.menus.get(top.menuId);
		if (!top || !def?.handlers.some((h) => h.kind === 'button' && h.id === nav.onYes)) {
			throw new Error(`Nav.confirm: menu "${top?.menuId}" has no @Button("${nav.onYes}")`);
		}
		const state: ConfirmState = {
			message: nav.message,
			menuId: top.menuId,
			onYes: nav.onYes,
			args: nav.args,
			...(nav.yesLabel ? { yesLabel: nav.yesLabel } : {}),
			...(nav.noLabel ? { noLabel: nav.noLabel } : {}),
		};
		session.state[CONFIRM_STATE_KEY] = state;
		session.stack.push({ menuId: CONFIRM_MENU, args: [] });
	}
}
