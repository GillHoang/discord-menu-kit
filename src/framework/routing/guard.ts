/**
 * In-process protection against duplicate / concurrent interactions.
 * Single-process only: with several bot processes, back this with Redis (SET NX) instead.
 */
export class InteractionGuard {
	private readonly seen = new Map<string, number>();
	private readonly locks = new Set<string>();

	constructor(
		private readonly ttlMs = 60_000,
		private readonly now: () => number = Date.now,
	) {}

	/** true the first time an interaction id is seen; false for redeliveries. */
	claim(interactionId: string): boolean {
		const t = this.now();
		if (this.seen.size > 1000) for (const [id, exp] of this.seen) if (exp <= t) this.seen.delete(id);
		if ((this.seen.get(interactionId) ?? 0) > t) return false;
		this.seen.set(interactionId, t + this.ttlMs);
		return true;
	}

	/** Runs `fn` unless another call with the same key is in flight (then returns false). */
	async exclusive(key: string, fn: () => Promise<void>): Promise<boolean> {
		if (this.locks.has(key)) return false;
		this.locks.add(key);
		try {
			await fn();
		} finally {
			this.locks.delete(key);
		}
		return true;
	}
}
