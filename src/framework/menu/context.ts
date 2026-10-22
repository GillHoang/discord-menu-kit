import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type AnySelectMenuInteraction,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type ModalSubmitInteraction,
	type User,
} from 'discord.js';
import { getLogger, type Logger } from '../logging/logger.js';
import { encodeCustomId } from '../routing/custom-id.js';
import { paginate, type Page, type PageOptions } from './paginate.js';
import type { Session } from '../session/session.js';

export type MenuInteraction =
	| ChatInputCommandInteraction
	| ButtonInteraction
	| AnySelectMenuInteraction
	| ModalSubmitInteraction;

export interface ButtonOptions {
	style?: ButtonStyle;
	args?: string[];
	disabled?: boolean;
	emoji?: string;
}

export interface ModalField {
	id: string;
	label: string;
	style?: TextInputStyle;
	placeholder?: string;
	required?: boolean;
	value?: string;
}

/** Everything a handler or `render` needs: who clicked, args, session state and UI builders. */
export class MenuContext {
	constructor(
		readonly interaction: MenuInteraction,
		readonly session: Session,
		readonly menuId: string,
		/** args from the clicked customId (handlers) or from `Nav.to(menu, ...args)` (render) */
		readonly args: readonly string[],
	) {}

	get user(): User {
		return this.interaction.user;
	}

	get guildId(): string | null {
		return this.interaction.guildId;
	}

	/** Per-session scratch space, persisted after every handler. */
	get state(): Record<string, unknown> {
		return this.session.state;
	}

	/** Parsed modal input when the handler declares `@Modal(id, { schema })`. */
	data: unknown;

	/** `ctx.data` with your type: `const { name } = ctx.input<{ name: string }>()`. */
	input<T>(): T {
		return this.data as T;
	}

	/** Logger bound to this request (requestId, userId, menuId, action). */
	get log(): Logger {
		return getLogger();
	}

	/** Chosen values of a select menu. */
	get values(): readonly string[] {
		if (!('values' in this.interaction)) throw new Error('ctx.values is only available in @Select handlers');
		return this.interaction.values;
	}

	/** Text input value of a modal. */
	field(id: string): string {
		if (!this.interaction.isModalSubmit()) throw new Error('ctx.field() is only available in @Modal handlers');
		return this.interaction.fields.getTextInputValue(id);
	}

	/** customId that routes back to `@Button/@Select/@Modal(action)` of the menu being rendered. */
	cid(action: string, ...args: string[]): string {
		return encodeCustomId(this.session.id, this.menuId, action, args);
	}

	button(action: string, label: string, options: ButtonOptions = {}): ButtonBuilder {
		const b = new ButtonBuilder()
			.setCustomId(this.cid(action, ...(options.args ?? [])))
			.setLabel(label)
			.setStyle(options.style ?? ButtonStyle.Secondary)
			.setDisabled(options.disabled ?? false);
		if (options.emoji) b.setEmoji(options.emoji);
		return b;
	}

	row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
		return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
	}

	select(
		action: string,
		options: { label: string; value: string; description?: string; default?: boolean }[],
		config: { placeholder?: string; min?: number; max?: number } = {},
	): ActionRowBuilder<StringSelectMenuBuilder> {
		const menu = new StringSelectMenuBuilder()
			.setCustomId(this.cid(action))
			.addOptions(options)
			.setMinValues(config.min ?? 1)
			.setMaxValues(config.max ?? 1);
		if (config.placeholder) menu.setPlaceholder(config.placeholder);
		return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
	}

	/** Slice a list for the current page; `page.row` holds the ◀ n/m ▶ buttons (handled by the router). */
	paginate<T>(items: readonly T[], options?: PageOptions): Page<T> {
		return paginate(this, items, options);
	}

	/** Build a modal whose submit is handled by `@Modal(action)` of the current menu; return it as `Nav.modal(...)`. */
	modal(action: string, title: string, fields: ModalField[]): ModalBuilder {
		const modal = new ModalBuilder().setCustomId(this.cid(action)).setTitle(title);
		for (const f of fields) {
			const input = new TextInputBuilder()
				.setCustomId(f.id)
				.setLabel(f.label)
				.setStyle(f.style ?? TextInputStyle.Short)
				.setRequired(f.required ?? true);
			if (f.placeholder) input.setPlaceholder(f.placeholder);
			if (f.value) input.setValue(f.value);
			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
		}
		return modal;
	}
}
