import { vi } from 'vitest';

let seq = 0;

export interface FakeOptions {
	userId?: string;
	/** null simulates a DM */
	guildId?: string | null;
	permissions?: string[];
	roles?: string[];
	args?: string[];
}

/** Minimal stand-in for a discord.js ButtonInteraction, enough for the Router. */
export function fakeClick(sessionId: string, menuId: string, action: string, options: FakeOptions = {}) {
	const perms = new Set(options.permissions ?? []);
	const state = { deferred: false };
	return {
		id: `i${++seq}`,
		customId: ['km', sessionId, menuId, action, ...(options.args ?? [])].join(':'),
		user: { id: options.userId ?? 'u1' },
		guildId: options.guildId === undefined ? 'g1' : options.guildId,
		memberPermissions: { has: (p: string[]) => p.every((x) => perms.has(x)) },
		member: { roles: options.roles ?? [] },
		replied: false,
		get deferred() {
			return state.deferred;
		},
		isModalSubmit: () => false,
		isButton: () => true,
		deferUpdate: vi.fn(async () => {
			state.deferred = true;
		}),
		update: vi.fn(),
		editReply: vi.fn(),
		reply: vi.fn(),
		followUp: vi.fn(),
	};
}
