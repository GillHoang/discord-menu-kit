import type { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import type { MenuContext } from './context.js';

/** Reserved action: the router handles prev/next itself, menus need no handler. */
export const PAGE_ACTION = '~page';
export const pageStateKey = (key: string): string => `page:${key}`;

export interface PageOptions {
	pageSize?: number;
	/** distinguishes several lists in one menu; must not contain ":" */
	key?: string;
}

export interface Page<T> {
	items: T[];
	/** 0-based, already clamped to the valid range */
	page: number;
	pages: number;
	total: number;
	/** ◀ 2/5 ▶ — put it in `components` */
	row: ActionRowBuilder<ButtonBuilder>;
}

/** Slice `items` for the page stored in the session and build the navigation row. */
export function paginate<T>(ctx: MenuContext, items: readonly T[], options: PageOptions = {}): Page<T> {
	const { pageSize = 5, key = 'default' } = options;
	const pages = Math.max(1, Math.ceil(items.length / pageSize));
	const raw = Number(ctx.state[pageStateKey(key)] ?? 0);
	const page = Math.min(Math.max(Number.isFinite(raw) ? Math.trunc(raw) : 0, 0), pages - 1);
	ctx.state[pageStateKey(key)] = page; // persist the clamped value so prev/next stay consistent
	const row = ctx.row(
		ctx.button(PAGE_ACTION, '◀', { args: [key, 'prev'], disabled: page === 0 }),
		ctx.button(PAGE_ACTION, `${page + 1}/${pages}`, { args: [key, 'label'], disabled: true }),
		ctx.button(PAGE_ACTION, '▶', { args: [key, 'next'], disabled: page >= pages - 1 }),
	);
	return { items: items.slice(page * pageSize, (page + 1) * pageSize), page, pages, total: items.length, row };
}

/** Built-in `~page` action: args are `[key, 'prev' | 'next' | 'label']`; paginate() clamps on render. */
export function turnPage(state: Record<string, unknown>, args: readonly string[]): void {
	const [key, dir] = args;
	if (!key || (dir !== 'prev' && dir !== 'next')) return;
	const k = pageStateKey(key);
	state[k] = (Number(state[k]) || 0) + (dir === 'next' ? 1 : -1);
}
