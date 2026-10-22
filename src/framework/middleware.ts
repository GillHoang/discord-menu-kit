import type { MenuContext } from './context.js';
import type { HandlerDef } from './decorators.js';

/** Throw from a handler or middleware to show `message` to the user as an ephemeral reply. */
export class UserError extends Error {}

export interface HandlerInfo {
	menuId: string;
	handler: HandlerDef;
}

/**
 * Runs around every handler (like a servlet filter). Call `next()` to continue,
 * throw `UserError` to reject.
 */
export type Middleware = (ctx: MenuContext, info: HandlerInfo, next: () => Promise<void>) => Promise<void>;

/** Enforces `@Button('x', { cooldownMs })` per user and handler. */
export function cooldownMiddleware(now: () => number = Date.now): Middleware {
	const last = new Map<string, number>();
	return async (ctx, { menuId, handler }, next) => {
		if (handler.cooldownMs > 0) {
			const key = `${ctx.user.id}:${menuId}:${handler.kind}:${handler.id}`;
			const t = now();
			const wait = (last.get(key) ?? 0) + handler.cooldownMs - t;
			if (wait > 0) throw new UserError(`Chậm thôi, thử lại sau ${Math.ceil(wait / 1000)}s.`);
			last.set(key, t);
		}
		await next();
	};
}

export function runMiddleware(
	chain: readonly Middleware[],
	ctx: MenuContext,
	info: HandlerInfo,
	final: () => Promise<void>,
): Promise<void> {
	const run = (i: number): Promise<void> => {
		const mw = chain[i];
		return mw ? mw(ctx, info, () => run(i + 1)) : final();
	};
	return run(0);
}
