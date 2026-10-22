import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Fields attached to every log line written while handling one interaction / job. */
export interface RequestContext {
	requestId: string;
	interactionId?: string;
	userId?: string;
	guildId?: string | null;
	menuId?: string;
	action?: string;
	/** set for @Scheduled jobs */
	job?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** JSON logger; level from `LOG_LEVEL` (default `info`). Pipe through `pino-pretty` for dev. */
export function createLogger(options: LoggerOptions = {}, destination?: DestinationStream): Logger {
	return pino({ level: process.env['LOG_LEVEL'] ?? 'info', ...options }, destination);
}

let root: Logger = createLogger();

export function setLogger(logger: Logger): void {
	root = logger;
}

/** Logger bound to the current request (requestId, userId, menuId, action…) when called inside one. */
export function getLogger(): Logger {
	const ctx = storage.getStore();
	return ctx ? root.child({ ...ctx }) : root;
}

/** Run `fn` with a fresh requestId; everything it awaits sees the same context via AsyncLocalStorage. */
export function runWithRequest<T>(init: Partial<RequestContext>, fn: () => T): T {
	return storage.run({ ...init, requestId: init.requestId ?? randomUUID().slice(0, 8) }, fn);
}

export function currentRequest(): RequestContext | undefined {
	return storage.getStore();
}
