import { randomBytes } from 'node:crypto';

export interface StackEntry {
	menuId: string;
	args: string[];
}

export interface Session {
	id: string;
	ownerId: string;
	/** navigation stack; the last entry is the menu currently shown */
	stack: StackEntry[];
	/** free-form per-session data shared by all handlers (page numbers, selected item, ...) */
	state: Record<string, unknown>;
	expiresAt: number;
}

/** Port: swap in Redis later without touching the router. */
export interface SessionStore {
	create(ownerId: string, rootMenuId: string): Session | Promise<Session>;
	get(id: string): Session | undefined | Promise<Session | undefined>;
	/** persist changes and extend the TTL */
	save(session: Session): void | Promise<void>;
	delete(id: string): void | Promise<void>;
}

export class MemorySessionStore implements SessionStore {
	private readonly sessions = new Map<string, Session>();

	constructor(
		private readonly ttlMs = 15 * 60_000,
		private readonly now: () => number = Date.now,
	) {}

	create(ownerId: string, rootMenuId: string): Session {
		this.sweep();
		const session: Session = {
			id: randomBytes(4).toString('hex'),
			ownerId,
			stack: [{ menuId: rootMenuId, args: [] }],
			state: {},
			expiresAt: this.now() + this.ttlMs,
		};
		this.sessions.set(session.id, session);
		return session;
	}

	get(id: string): Session | undefined {
		const session = this.sessions.get(id);
		if (session && session.expiresAt <= this.now()) {
			this.sessions.delete(id);
			return undefined;
		}
		return session;
	}

	save(session: Session): void {
		session.expiresAt = this.now() + this.ttlMs;
		this.sessions.set(session.id, session);
	}

	delete(id: string): void {
		this.sessions.delete(id);
	}

	private sweep(): void {
		const now = this.now();
		for (const [id, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(id);
	}
}
