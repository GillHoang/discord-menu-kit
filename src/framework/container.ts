// biome-ignore-all lint/suspicious/noExplicitAny: constructor args are intentionally untyped
export type Class<T = object> = new (...args: any[]) => T;

/**
 * Tiny DI container: lazy singletons keyed by class.
 * `@Service()` classes and `@Menu()` classes are created on first `get`, and their
 * `@Inject(...)` fields are filled during construction (see decorators.ts).
 */
export class Container {
	private readonly instances = new Map<Class, object>();
	private readonly overrides = new Map<Class, object>();

	get<T extends object>(token: Class<T>): T {
		const override = this.overrides.get(token);
		if (override) return override as T;
		let instance = this.instances.get(token);
		if (!instance) {
			instance = new token();
			this.instances.set(token, instance);
		}
		return instance as T;
	}

	/** Replace a bean (tests, or swapping an implementation). */
	provide<T extends object>(token: Class<T>, instance: T): void {
		this.overrides.set(token, instance);
	}

	reset(): void {
		this.instances.clear();
		this.overrides.clear();
	}
}

export const container = new Container();
