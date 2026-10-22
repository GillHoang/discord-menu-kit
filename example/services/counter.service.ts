import { Service } from '../../src/framework/index.js';

/** Example bean. Real projects put business logic / repositories in `*.service.ts` files like this. */
@Service()
export class CounterService {
	private readonly counts = new Map<string, number>();

	get(userId: string): number {
		return this.counts.get(userId) ?? 0;
	}

	reset(userId: string): void {
		this.counts.delete(userId);
	}

	increment(userId: string): number {
		const next = this.get(userId) + 1;
		this.counts.set(userId, next);
		return next;
	}
}
