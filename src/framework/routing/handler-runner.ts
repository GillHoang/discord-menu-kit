import type { ModalSubmitInteraction } from 'discord.js';
import type { ZodType } from 'zod';
import { container } from '../core/container.js';
import type { HandlerDef, MenuDef } from '../core/decorators.js';
import { MenuContext } from '../menu/context.js';
import { Nav } from '../menu/nav.js';
import { runMiddleware, UserError, type Middleware } from '../middleware/middleware.js';
import type { Session } from '../session/session.js';
import type { Navigator } from './navigator.js';
import type { HandledInteraction } from './presenter.js';

type Method = (ctx: MenuContext) => Nav | void | Promise<Nav | void>;

/** Runs one handler: slow-ack / auto-defer → middleware → (modal schema) → method → apply `Nav`. */
export class HandlerRunner {
	constructor(
		private readonly middleware: readonly Middleware[],
		private readonly navigator: Navigator,
		/** defer automatically when a handler is still running after this many ms; false = off */
		private readonly autoDeferMs: number | false,
	) {}

	async run(
		i: HandledInteraction,
		session: Session,
		def: MenuDef,
		handler: HandlerDef,
		args: readonly string[],
	): Promise<void> {
		if (handler.slow) await i.deferUpdate();
		const ctx = new MenuContext(i, session, def.id, args);
		let nav: Nav = Nav.stay();
		let early: Promise<unknown> | undefined;
		const timer =
			!handler.slow && this.autoDeferMs
				? setTimeout(() => {
						early = i.deferUpdate().catch(() => undefined);
					}, this.autoDeferMs)
				: undefined;
		try {
			await runMiddleware(this.middleware, ctx, { menuId: def.id, handler }, async () => {
				if (handler.schema && i.isModalSubmit()) ctx.data = parseModal(i, handler.schema);
				const menu = container.get(def.ctor) as unknown as Record<string, Method>;
				nav = (await menu[handler.method]!(ctx)) ?? Nav.stay();
			});
		} finally {
			if (timer) clearTimeout(timer);
			await early; // never race the deferred ack against the final update
		}
		await this.navigator.apply(i, session, nav);
	}
}

/** Collect the modal's text inputs and validate them; failures are shown to the user as an ephemeral list. */
function parseModal(i: ModalSubmitInteraction, schema: ZodType): unknown {
	const values: Record<string, string> = {};
	for (const f of i.fields.fields.values()) if ('value' in f && typeof f.value === 'string') values[f.customId] = f.value;
	const result = schema.safeParse(values);
	if (result.success) return result.data;
	const lines = result.error.issues.map((is) => `• ${is.path.join('.') || 'giá trị'}: ${is.message}`);
	throw new UserError(`Dữ liệu chưa hợp lệ:\n${lines.join('\n')}`);
}
