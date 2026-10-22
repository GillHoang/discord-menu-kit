import { container } from '../core/container.js';
import type { MenuDef } from '../core/decorators.js';
import { CONFIRM_MENU, CONFIRM_STATE_KEY, type ConfirmState } from '../menu/confirm.js';
import { MenuContext } from '../menu/context.js';
import { Nav } from '../menu/nav.js';
import { isWizardDirection, WizardMenu } from '../menu/wizard.js';
import type { Session } from '../session/session.js';
import type { DecodedCustomId } from './custom-id.js';
import type { HandlerRunner } from './handler-runner.js';
import type { Navigator } from './navigator.js';
import type { HandledInteraction } from './presenter.js';

export interface BuiltinDeps {
	menus: ReadonlyMap<string, MenuDef>;
	navigator: Navigator;
	runner: HandlerRunner;
}

/** `yes` runs the original `@Button(onYes)` (with its middleware); anything else goes back. */
export async function handleConfirm(
	deps: BuiltinDeps,
	i: HandledInteraction,
	session: Session,
	d: DecodedCustomId,
): Promise<void> {
	const state = session.state[CONFIRM_STATE_KEY] as ConfirmState | undefined;
	delete session.state[CONFIRM_STATE_KEY];
	if (!state || d.action !== 'yes') return deps.navigator.apply(i, session, Nav.back());

	if (session.stack.at(-1)?.menuId === CONFIRM_MENU) session.stack.pop();
	const def = deps.menus.get(state.menuId);
	const handler = def?.handlers.find((h) => h.kind === 'button' && h.id === state.onYes);
	if (!def || !handler) throw new Error(`Confirm target @Button("${state.onYes}") not found on "${state.menuId}"`);
	await deps.runner.run(i, session, def, handler, state.args);
}

/** Back / Next / Cancel of a `WizardMenu`. */
export async function handleWizard(
	deps: BuiltinDeps,
	i: HandledInteraction,
	session: Session,
	def: MenuDef | undefined,
	d: DecodedCustomId,
): Promise<void> {
	const menu = def && container.get(def.ctor);
	const direction = d.args[0];
	if (!def || !(menu instanceof WizardMenu) || !isWizardDirection(direction)) {
		throw new Error(`Invalid wizard action on menu "${d.menuId}"`);
	}
	const ctx = new MenuContext(i, session, def.id, d.args);
	if (direction === 'next' && menu.finishSlow && menu.atLastStep(ctx)) await i.deferUpdate();
	await deps.navigator.apply(i, session, await menu.advance(ctx, direction));
}
