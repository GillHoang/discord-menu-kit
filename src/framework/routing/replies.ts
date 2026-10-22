import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { getLogger } from '../logging/logger.js';
import type { MenuInteraction } from '../menu/context.js';
import { UserError } from '../middleware/middleware.js';
import { reopenRow } from './expiry.js';

export interface RouterMessages {
	expired: string;
	notOwner: string;
	error: string;
	reopen: string;
	/** shown instead of an empty message when a Components V2 menu is closed */
	closed: string;
}

const DEFAULT_MESSAGES: RouterMessages = {
	expired: 'Menu đã hết hạn, hãy mở menu mới.',
	notOwner: 'Đây không phải menu của bạn, hãy mở menu riêng.',
	error: 'Có lỗi xảy ra, thử lại sau nhé.',
	reopen: 'Mở lại menu',
	closed: 'Menu đã đóng.',
};

/** Ephemeral notices and error handling used by the router, plus the user-facing texts. */
export class Replies {
	readonly messages: RouterMessages;

	constructor(
		messages: Partial<RouterMessages> | undefined,
		private readonly onError?: (error: unknown) => void,
	) {
		this.messages = { ...DEFAULT_MESSAGES, ...messages };
	}

	/** Ephemeral text, optionally with the "reopen menu" button; `followUp` when already acknowledged. */
	async ephemeral(i: MenuInteraction, content: string, reopen = false): Promise<void> {
		const payload = {
			content,
			flags: MessageFlags.Ephemeral,
			...(reopen ? { components: [reopenRow(this.messages.reopen)] } : {}),
		} as const;
		if (i.replied || i.deferred) await (i as ButtonInteraction).followUp(payload);
		else await (i as ButtonInteraction).reply(payload);
	}

	/** `UserError` is shown as is; anything else is logged (and passed to `onError`) behind a generic message. */
	async fail(i: MenuInteraction, error: unknown): Promise<void> {
		const expected = error instanceof UserError;
		if (!expected) {
			getLogger().error({ err: error }, 'handler failed');
			this.onError?.(error);
		}
		await this.ephemeral(i, expected ? error.message : this.messages.error).catch(() => undefined);
	}
}
