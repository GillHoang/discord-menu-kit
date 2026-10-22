import type { PermissionResolvable } from 'discord.js';
import type { ZodType } from 'zod';
import { container, type Class } from './container.js';
import { registerLifecycle } from './lifecycle.js';
import type { BaseMenu } from '../menu/menu.js';

export type HandlerKind = 'button' | 'select' | 'modal';

export interface HandlerDef {
	kind: HandlerKind;
	/** the `action` part of the customId */
	id: string;
	/** method name on the menu class */
	method: string;
	cooldownMs: number;
	slow: boolean;
	guildOnly: boolean;
	permissions: PermissionResolvable[];
	roles: string[];
	schema?: ZodType;
}

export interface MenuDef {
	id: string;
	ctor: Class<BaseMenu>;
	root: boolean;
	handlers: HandlerDef[];
}

export interface HandlerOptions {
	/** per-user cooldown for this handler; 0 = none */
	cooldownMs?: number;
	/**
	 * Ack with `deferUpdate()` before running (handlers that call a DB/API and may exceed Discord's 3s).
	 * The result is sent with `editReply`. Do not return `Nav.modal` from a slow handler.
	 */
	slow?: boolean;
	/** reject DMs */
	guildOnly?: boolean;
	/** member must have all of these, e.g. `['BanMembers']` (implies guildOnly) */
	permissions?: PermissionResolvable[];
	/** member must have at least one of these role ids (implies guildOnly) */
	roles?: string[];
	/**
	 * `@Modal` only: validate the submitted text inputs (keyed by input id) before the handler runs.
	 * Failures are shown to the user; read the parsed result with `ctx.input<T>()`.
	 */
	schema?: ZodType;
}

const HANDLERS = Symbol.for('menu-kit.handlers');

/** Filled by decorators while modules are imported (see scan.ts). */
export const menuRegistry: MenuDef[] = [];
export const serviceRegistry: Class[] = [];

/** Marks a class as a singleton bean. Instantiated lazily, or eagerly at boot to fail fast. */
export function Service() {
	return (target: Class, context: ClassDecoratorContext): void => {
		serviceRegistry.push(target);
		registerLifecycle(target, context.metadata); // @OnStart / @OnStop / @Scheduled methods
	};
}

/** Field injection: `@Inject(UserService) private readonly users!: UserService;` */
export function Inject<T extends object>(token: Class<T>) {
	return (_value: undefined, _context: ClassFieldDecoratorContext): (() => T) =>
		() =>
			container.get(token);
}

/** Registers a menu. Exactly one menu must be `{ root: true }` — it is what the slash command opens. */
export function Menu(id: string, options: { root?: boolean } = {}) {
	return (target: Class<BaseMenu>, context: ClassDecoratorContext): void => {
		if (id.startsWith('~') || id.includes(':')) throw new Error(`Invalid menu id "${id}" ("~" prefix and ":" are reserved)`);
		if (menuRegistry.some((m) => m.id === id)) throw new Error(`Duplicate menu id: ${id}`);
		const handlers = (context.metadata[HANDLERS] as HandlerDef[] | undefined) ?? [];
		menuRegistry.push({ id, ctor: target, root: options.root ?? false, handlers });
	};
}

function handlerDecorator(kind: HandlerKind) {
	return (id: string, options: HandlerOptions = {}) =>
		(_method: unknown, context: ClassMethodDecoratorContext): void => {
			const meta = context.metadata;
			// copy-on-write so a subclass never mutates its parent's handler list
			if (!Object.hasOwn(meta, HANDLERS)) meta[HANDLERS] = [...((meta[HANDLERS] as HandlerDef[] | undefined) ?? [])];
			const list = meta[HANDLERS] as HandlerDef[];
			if (list.some((h) => h.kind === kind && h.id === id)) throw new Error(`Duplicate @${kind} handler "${id}"`);
			list.push({
				kind,
				id,
				method: String(context.name),
				cooldownMs: options.cooldownMs ?? 0,
				slow: options.slow ?? false,
				guildOnly: options.guildOnly ?? false,
				permissions: options.permissions ?? [],
				roles: options.roles ?? [],
				...(options.schema ? { schema: options.schema } : {}),
			});
		};
}

/** `@Button('buy') buy(ctx) {}` — customId action `buy` of a button rendered by this menu. */
export const Button = handlerDecorator('button');
/** `@Select('pick') pick(ctx) {}` — string/user/role/channel select; chosen values are in `ctx.values`. */
export const Select = handlerDecorator('select');
/** `@Modal('rename') renamed(ctx) {}` — modal submit; read inputs with `ctx.field('id')`. */
export const Modal = handlerDecorator('modal');
