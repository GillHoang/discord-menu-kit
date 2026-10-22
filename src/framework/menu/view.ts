import {
	ActionRowBuilder,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	type ButtonBuilder,
	type StringSelectMenuBuilder,
} from 'discord.js';
import type { MenuView } from './menu.js';

/** A view after `normalizeView`: Components V2 views carry the IsComponentsV2 flag. */
export type NormalizedView = MenuView & { flags?: number };

export const MAX_V2_COMPONENTS = 40;
export const MAX_CLASSIC_ROWS = 5;

// section, text display, thumbnail, media gallery, file, separator, container
const V2_TYPES = new Set([9, 10, 11, 12, 13, 14, 17]);
// button, string/user/role/mentionable/channel select
const INTERACTIVE_TYPES = new Set([2, 3, 5, 6, 7, 8]);

const toRaw = (c: unknown): unknown =>
	c && typeof (c as { toJSON?: unknown }).toJSON === 'function' ? (c as { toJSON(): unknown }).toJSON() : c;

/** Every component counts, nested ones included (Discord's limit for V2 messages is 40 in total). */
export function countComponents(node: unknown): number {
	if (Array.isArray(node)) return node.reduce((n: number, c) => n + countComponents(c), 0);
	if (!node || typeof node !== 'object') return 0;
	const o = node as Record<string, unknown>;
	let n = typeof o['type'] === 'number' ? 1 : 0;
	for (const v of Object.values(o)) if (v && typeof v === 'object') n += countComponents(v);
	return n;
}

export function hasV2Components(view: MenuView): boolean {
	return (view.components ?? []).some((c) => {
		const type = (toRaw(c) as { type?: number } | undefined)?.type;
		return type !== undefined && V2_TYPES.has(type);
	});
}

export function isV2View(view: { flags?: unknown }): boolean {
	return typeof view.flags === 'number' && (view.flags & MessageFlags.IsComponentsV2) !== 0;
}

/**
 * Validate a rendered view and flag it as Components V2 when it uses V2 components.
 * Fails at render time with the menu id instead of an opaque Discord API error.
 */
export function normalizeView(view: MenuView, label: string): NormalizedView {
	if (!hasV2Components(view)) {
		const rows = (view.components ?? []).length;
		if (rows > MAX_CLASSIC_ROWS) throw new Error(`Menu "${label}": ${rows} hàng component, tối đa ${MAX_CLASSIC_ROWS}`);
		return view;
	}
	const record = view as Record<string, unknown>;
	const banned = ['content', 'embeds', 'poll', 'stickers'].filter((k) => {
		const v = record[k];
		return Array.isArray(v) ? v.length > 0 : Boolean(v);
	});
	if (banned.length > 0) throw new Error(`Menu "${label}" dùng Components V2 nên không được có: ${banned.join(', ')}`);
	const total = countComponents((view.components ?? []).map(toRaw));
	if (total > MAX_V2_COMPONENTS) {
		throw new Error(`Menu "${label}": ${total} component, vượt giới hạn ${MAX_V2_COMPONENTS} của Components V2`);
	}
	return { ...view, flags: MessageFlags.IsComponentsV2 };
}

/** Deep copy of raw component JSON with every interactive component disabled (link buttons are left alone). */
export function disableAll<T>(node: T): T {
	if (Array.isArray(node)) return node.map(disableAll) as T;
	if (!node || typeof node !== 'object') return node;
	const o: Record<string, unknown> = { ...(node as Record<string, unknown>) };
	for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') o[k] = disableAll(v);
	if (typeof o['type'] === 'number' && INTERACTIVE_TYPES.has(o['type']) && o['custom_id'] !== undefined) o['disabled'] = true;
	return o as T;
}

// ---- Components V2 helpers -------------------------------------------------------------------

type Row = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;
export type PanelChild = TextDisplayBuilder | SeparatorBuilder | Row;
export type V2Top = ContainerBuilder | PanelChild;

/** Markdown text block. */
export const text = (markdown: string): TextDisplayBuilder => new TextDisplayBuilder().setContent(markdown);

export const separator = (divider = true): SeparatorBuilder =>
	new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Small);

/** A V2 container ("card") with an optional accent colour. */
export function panel(children: readonly PanelChild[], accentColor?: number): ContainerBuilder {
	const c = new ContainerBuilder();
	if (accentColor !== undefined) c.setAccentColor(accentColor);
	for (const child of children) {
		if (child instanceof TextDisplayBuilder) c.addTextDisplayComponents(child);
		else if (child instanceof SeparatorBuilder) c.addSeparatorComponents(child);
		else c.addActionRowComponents(child as ActionRowBuilder<ButtonBuilder>);
	}
	return c;
}

/** `render` return value for a Components V2 menu: `return v2(panel([text('hi'), ctx.row(...)]))`. */
export const v2 = (...components: V2Top[]): MenuView => ({ components: components as MenuView['components'] });
