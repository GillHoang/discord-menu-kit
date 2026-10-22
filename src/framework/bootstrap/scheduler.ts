import type { ScheduleSpec } from '../core/lifecycle.js';
import { getLogger, runWithRequest } from '../logging/logger.js';

export interface Job {
	name: string;
	spec: ScheduleSpec;
	run(): void | Promise<void>;
}

const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

/** `'30s'`, `'5m'`, `'2h'`, `'250ms'` or a number of milliseconds. */
export function parseEvery(value: string | number): number {
	if (typeof value === 'number') {
		if (!(value > 0)) throw new Error(`Invalid interval: ${value}`);
		return value;
	}
	const m = /^(\d+)(ms|s|m|h)$/.exec(value.trim());
	if (!m) throw new Error(`Invalid interval "${value}" (use e.g. "30s", "5m", "2h")`);
	return Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS];
}

interface Field {
	any: boolean;
	values: Set<number>;
}

// minute, hour, day of month, month, day of week (0 or 7 = Sunday)
const RANGES: readonly (readonly [number, number])[] = [
	[0, 59],
	[0, 23],
	[1, 31],
	[1, 12],
	[0, 7],
];

function parseField(src: string, [min, max]: readonly [number, number]): Field {
	const values = new Set<number>();
	for (const part of src.split(',')) {
		const [rangeSrc = '', stepSrc] = part.split('/');
		const step = stepSrc === undefined ? 1 : Number(stepSrc);
		let lo = min;
		let hi = max;
		if (rangeSrc !== '*') {
			const [a = '', b] = rangeSrc.split('-');
			lo = Number(a);
			hi = b !== undefined ? Number(b) : stepSrc !== undefined ? max : lo;
		}
		if (![lo, hi, step].every(Number.isInteger) || step < 1 || lo < min || hi > max || lo > hi) {
			throw new Error(`Invalid cron field "${src}"`);
		}
		for (let v = lo; v <= hi; v += step) values.add(v);
	}
	return { any: src === '*', values };
}

/** 5-field cron → predicate on a Date (local time). Day-of-month and day-of-week combine with OR when both are set. */
export function parseCron(expr: string): (d: Date) => boolean {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) throw new Error(`Cron needs 5 fields: "${expr}"`);
	const [mi, ho, dom, mo, dow] = parts.map((p, i) => parseField(p, RANGES[i]!)) as [Field, Field, Field, Field, Field];
	if (dow.values.has(7)) dow.values.add(0);
	return (d) => {
		if (!mi.values.has(d.getMinutes()) || !ho.values.has(d.getHours()) || !mo.values.has(d.getMonth() + 1)) return false;
		const domOk = dom.values.has(d.getDate());
		const dowOk = dow.values.has(d.getDay());
		return dom.any || dow.any ? domOk && dowOk : domOk || dowOk;
	};
}

/** Runs cron jobs (checked once per minute) and fixed-interval jobs; a job never overlaps itself. */
export class Scheduler {
	private readonly cronJobs: { job: Job; matches: (d: Date) => boolean }[] = [];
	private readonly everyJobs: { job: Job; ms: number }[] = [];
	private readonly running = new Set<string>();
	private timers: NodeJS.Timeout[] = [];
	private tickTimer: NodeJS.Timeout | undefined;

	/** Throws on an invalid spec, so a typo fails at boot rather than silently never running. */
	constructor(jobs: readonly Job[]) {
		for (const job of jobs) {
			if (typeof job.spec === 'string') this.cronJobs.push({ job, matches: parseCron(job.spec) });
			else this.everyJobs.push({ job, ms: parseEvery(job.spec.every) });
		}
	}

	start(): void {
		for (const { job, ms } of this.everyJobs) this.timers.push(setInterval(() => void this.fire(job), ms));
		if (this.cronJobs.length > 0) this.scheduleTick();
	}

	stop(): void {
		for (const t of this.timers) clearInterval(t);
		clearTimeout(this.tickTimer);
		this.timers = [];
		this.tickTimer = undefined;
	}

	/** Fire every cron job due at `now` (public for tests). */
	runDue(now: Date): Promise<void[]> {
		return Promise.all(this.cronJobs.filter((c) => c.matches(now)).map((c) => this.fire(c.job)));
	}

	private scheduleTick(): void {
		this.tickTimer = setTimeout(() => {
			void this.runDue(new Date());
			this.scheduleTick();
		}, 60_000 - (Date.now() % 60_000) + 5);
	}

	private async fire(job: Job): Promise<void> {
		if (this.running.has(job.name)) {
			getLogger().warn({ job: job.name }, 'scheduled job skipped: previous run still going');
			return;
		}
		this.running.add(job.name);
		await runWithRequest({ job: job.name }, async () => {
			const log = getLogger();
			const started = performance.now();
			try {
				await job.run();
				log.info({ durationMs: Math.round(performance.now() - started) }, 'scheduled job done');
			} catch (e) {
				log.error({ err: e }, 'scheduled job failed');
			} finally {
				this.running.delete(job.name);
			}
		});
	}
}
