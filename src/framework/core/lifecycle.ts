import type { Class } from './container.js';

/** `'0 * * * *'` (5-field cron, server local time) or `{ every: '5m' | 90_000 }` (ms, s, m, h). */
export type ScheduleSpec = string | { every: string | number };

interface Marker {
	kind: 'start' | 'stop' | 'schedule';
	method: string;
	spec?: ScheduleSpec;
}

export interface HookDef {
	ctor: Class;
	method: string;
}

export interface JobDef extends HookDef {
	spec: ScheduleSpec;
}

const MARKERS = Symbol.for('menu-kit.lifecycle');

/** Filled when a `@Service` class is decorated (see `Service()` in decorators.ts). */
export const startHooks: HookDef[] = [];
export const stopHooks: HookDef[] = [];
export const scheduledJobs: JobDef[] = [];

function marker(kind: Marker['kind'], spec?: ScheduleSpec) {
	return (_method: unknown, context: ClassMethodDecoratorContext): void => {
		const meta = context.metadata;
		if (!Object.hasOwn(meta, MARKERS)) meta[MARKERS] = [...((meta[MARKERS] as Marker[] | undefined) ?? [])];
		(meta[MARKERS] as Marker[]).push({ kind, method: String(context.name), ...(spec ? { spec } : {}) });
	};
}

/** Runs once at boot, before the bot logs in (open DB pools, warm caches…). Order: import order. */
export const OnStart = () => marker('start');
/** Runs on shutdown (SIGINT / SIGTERM / `app.stop()`), in reverse import order. */
export const OnStop = () => marker('stop');
/** Background job; receives the discord.js `Client`. A run is skipped while the previous one is still going. */
export const Scheduled = (spec: ScheduleSpec) => marker('schedule', spec);

/** Called by `@Service()` with the class metadata gathered by the method decorators above. */
export function registerLifecycle(ctor: Class, metadata: DecoratorMetadataObject): void {
	for (const m of (metadata[MARKERS] as Marker[] | undefined) ?? []) {
		if (m.kind === 'start') startHooks.push({ ctor, method: m.method });
		else if (m.kind === 'stop') stopHooks.push({ ctor, method: m.method });
		else if (m.spec) scheduledJobs.push({ ctor, method: m.method, spec: m.spec });
	}
}
