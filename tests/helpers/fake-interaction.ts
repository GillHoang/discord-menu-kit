import { vi } from 'vitest';

let seq = 0;

export interface FakeOptions {
	userId?: string;
	/** null simulates a DM */
	guildId?: string | null;
	permissions?: string[];
	roles?: string[];
	args?: string[];
	/** the message the component sits on (needed for expiry / close behaviour); `v2` = Components V2 message */
	message?: { components: unknown[]; v2?: boolean };
	/** makes it a modal submit with these text inputs */
	modal?: Record<string, string>;
}

const IS_COMPONENTS_V2 = 32768;

/** Minimal stand-in for a discord.js Button / Modal interaction, enough for the Router. */
export function fakeClick(sessionId: string, menuId: string, action: string, options: FakeOptions = {}) {
	const perms = new Set(options.permissions ?? []);
	const state = { deferred: false, replied: false };
	const modal = options.modal;
	const msg = options.message;
	return {
		id: `i${++seq}`,
		customId: ['km', sessionId, menuId, action, ...(options.args ?? [])].join(':'),
		user: { id: options.userId ?? 'u1' },
		guildId: options.guildId === undefined ? 'g1' : options.guildId,
		memberPermissions: { has: (p: string[]) => p.every((x) => perms.has(x)) },
		member: { roles: options.roles ?? [] },
		message: msg && {
			components: msg.components.map((c) => ({ toJSON: () => c })),
			flags: { has: (f: number) => f === IS_COMPONENTS_V2 && (msg.v2 ?? false) },
		},
		get deferred() {
			return state.deferred;
		},
		get replied() {
			return state.replied;
		},
		isModalSubmit: () => modal !== undefined,
		isButton: () => modal === undefined,
		isFromMessage: () => true,
		fields: {
			fields: new Map(Object.entries(modal ?? {}).map(([k, v]) => [k, { customId: k, value: v }])),
			getTextInputValue: (k: string) => modal?.[k] ?? '',
		},
		deferUpdate: vi.fn(async () => {
			state.deferred = true;
		}),
		update: vi.fn(async (_payload?: unknown) => {
			state.replied = true;
		}),
		editReply: vi.fn(async (_payload?: unknown) => undefined),
		reply: vi.fn(async (_payload?: unknown) => {
			state.replied = true;
		}),
		followUp: vi.fn(async (_payload?: unknown) => undefined),
		showModal: vi.fn(async (_modal?: unknown) => undefined),
	};
}
