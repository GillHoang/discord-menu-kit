import { ButtonStyle } from 'discord.js';
import { UserError } from '../middleware/middleware.js';
import type { MenuContext } from './context.js';
import { BaseMenu, type MenuView } from './menu.js';
import { Nav } from './nav.js';
import { hasV2Components } from './view.js';

/** Reserved action: the router handles Back / Next / Cancel of a wizard itself. */
export const WIZARD_ACTION = '~wiz';
export type WizardDirection = 'back' | 'next' | 'cancel';
export const isWizardDirection = (v: unknown): v is WizardDirection =>
	v === 'back' || v === 'next' || v === 'cancel';

export interface WizardStep<D> {
	id: string;
	title: string;
	/** step body; Back / Cancel / Next buttons are appended automatically */
	render(ctx: MenuContext, data: D): MenuView;
	/** return an error message to block "Tiếp" */
	validate?(data: D): string | null | undefined;
}

interface WizardState<D> {
	index: number;
	data: D;
}

/**
 * Multi-step form. Subclass, list `steps`, write ordinary `@Select/@Button/@Modal` handlers that fill
 * `this.data(ctx)`, and implement `onFinish`. Progress lives in `ctx.state`, so keep `data` JSON-friendly.
 */
export abstract class WizardMenu<D extends Record<string, unknown> = Record<string, unknown>> extends BaseMenu {
	abstract readonly steps: readonly WizardStep<D>[];
	abstract onFinish(ctx: MenuContext, data: D): Nav | void | Promise<Nav | void>;
	/** set true when `onFinish` calls a DB/API: the router defers before running it */
	readonly finishSlow: boolean = false;

	/** collected answers so far (use inside your handlers) */
	data(ctx: MenuContext): D {
		return this.progress(ctx).data;
	}

	atLastStep(ctx: MenuContext): boolean {
		return this.progress(ctx).index >= this.steps.length - 1;
	}

	render(ctx: MenuContext): MenuView {
		const { index, data } = this.progress(ctx);
		const step = this.steps[index];
		if (!step) throw new Error(`Wizard "${ctx.menuId}" has no step ${index}`);
		const part = step.render(ctx, data);
		const last = index >= this.steps.length - 1;
		const row = ctx.row(
			ctx.button(WIZARD_ACTION, 'Quay lại', { args: ['back'], disabled: index === 0 }),
			ctx.button(WIZARD_ACTION, 'Hủy', { args: ['cancel'], style: ButtonStyle.Danger }),
			ctx.button(WIZARD_ACTION, last ? 'Hoàn tất' : 'Tiếp', { args: ['next'], style: ButtonStyle.Primary }),
		);
		const components = [...(part.components ?? []), row] as MenuView['components'];
		if (hasV2Components(part)) return { ...part, components };
		const title = `**Bước ${index + 1}/${this.steps.length}: ${step.title}**`;
		return { ...part, content: part.content ? `${title}\n${part.content}` : title, components };
	}

	/** Apply Back / Next / Cancel; throws `UserError` when the current step does not validate. */
	async advance(ctx: MenuContext, direction: WizardDirection): Promise<Nav> {
		const key = this.stateKey(ctx);
		const p = this.progress(ctx);
		if (direction === 'cancel') {
			delete ctx.state[key];
			return ctx.session.stack.length > 1 ? Nav.back() : Nav.close();
		}
		if (direction === 'back') {
			p.index = Math.max(0, p.index - 1);
			return Nav.stay();
		}
		const error = this.steps[p.index]?.validate?.(p.data);
		if (error) throw new UserError(error);
		if (p.index < this.steps.length - 1) {
			p.index++;
			return Nav.stay();
		}
		const result = await this.onFinish(ctx, p.data);
		delete ctx.state[key];
		return result ?? Nav.close();
	}

	private stateKey(ctx: MenuContext): string {
		return `wiz:${ctx.menuId}`;
	}

	private progress(ctx: MenuContext): WizardState<D> {
		const key = this.stateKey(ctx);
		let p = ctx.state[key] as WizardState<D> | undefined;
		if (!p) {
			p = { index: 0, data: {} as D };
			ctx.state[key] = p;
		}
		return p;
	}
}
