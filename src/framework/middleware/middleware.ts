import type { MenuContext } from '../menu/context.js';
import type { HandlerDef } from '../core/decorators.js';

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

/** Expired entries are dropped once the table grows past this many keys. */
const PRUNE_ABOVE = 1000;

/**
 * Enforces `@Button('x', { cooldownMs })` per user and handler.
 * `until` maps `user:menu:handler` to the time the cooldown ends; pass your own Map to inspect it in tests.
 */
export function cooldownMiddleware(now: () => number = Date.now, until: Map<string, number> = new Map()): Middleware {
	return async (ctx, { menuId, handler }, next) => {
		if (handler.cooldownMs > 0) {
			const t = now();
			const key = `${ctx.user.id}:${menuId}:${handler.kind}:${handler.id}`;
			const wait = (until.get(key) ?? 0) - t;
			if (wait > 0) throw new UserError(`Chậm thôi, thử lại sau ${Math.ceil(wait / 1000)}s.`);
			until.set(key, t + handler.cooldownMs);
			if (until.size > PRUNE_ABOVE) for (const [k, end] of until) if (end <= t) until.delete(k);
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
