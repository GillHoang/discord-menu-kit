import {
	Client,
	Events,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder,
	type ClientOptions,
	type MessageMentionOptions,
} from 'discord.js';
import { commandBody, commandRegistry, dispatchCommand } from '../command/command.js';
import { container } from '../core/container.js';
import { menuRegistry, serviceRegistry } from '../core/decorators.js';
import { scheduledJobs, startHooks, stopHooks, type HookDef } from '../core/lifecycle.js';
import { getLogger, setLogger, type Logger } from '../logging/logger.js';
import { cooldownMiddleware, type Middleware } from '../middleware/middleware.js';
import { permissionMiddleware } from '../middleware/permissions.js';
import { InteractionGuard } from '../routing/guard.js';
import { Router, type RouterOptions } from '../routing/router.js';
import { MemorySessionStore, type SessionStore } from '../session/session.js';
import { createReloader, watchDirectories } from './hot-reload.js';
import { scanDirectory } from './scan.js';
import { Scheduler } from './scheduler.js';

export interface AppOptions extends RouterOptions {
	token: string;
	clientId: string;
	/** register the commands to this guild only (instant); omit for global registration */
	guildId?: string;
	/** the single slash command that opens the root menu */
	command?: { name?: string; description?: string };
	/** directories scanned for `*.menu.ts`, `*.service.ts` and `*.command.ts` */
	scan: string[];
	middleware?: Middleware[];
	sessions?: SessionStore;
	/** your own pino logger (default: JSON to stdout, level from LOG_LEVEL) */
	logger?: Logger;
	/**
	 * Which mentions in bot messages may ping. Default `{ parse: [] }`: nothing pings, so text echoed from users
	 * (display names, typed input) cannot trigger @everyone / role / user pings.
	 */
	allowedMentions?: MessageMentionOptions;
	/** dev only: re-import `*.menu.ts` / `*.command.ts` on save without logging in again (services need a restart) */
	hotReload?: boolean;
	/** stop cleanly on SIGINT / SIGTERM (default true) */
	handleSignals?: boolean;
}

export interface App {
	client: Client;
	/** run `@OnStop` hooks, stop jobs and watchers, disconnect */
	stop(): Promise<void>;
}

const callHook = (def: HookDef, ...args: unknown[]): unknown =>
	(container.get(def.ctor) as unknown as Record<string, (...a: unknown[]) => unknown>)[def.method]!(...args);

/** Client options used by `startApp` (exported so the safe mention default is testable). */
export function discordClientOptions(allowedMentions?: MessageMentionOptions): ClientOptions {
	return { intents: [GatewayIntentBits.Guilds], allowedMentions: allowedMentions ?? { parse: [] } };
}

/** Boot everything: scan → wire beans → @OnStart → register slash commands → login → route interactions. */
export async function startApp(options: AppOptions): Promise<App> {
	if (options.logger) setLogger(options.logger);
	const log = getLogger();

	for (const dir of options.scan) await scanDirectory(dir);
	for (const service of serviceRegistry) container.get(service); // fail fast on broken wiring

	const name = options.command?.name ?? 'menu';
	const sessions = options.sessions ?? new MemorySessionStore();
	const guard = options.guard ?? new InteractionGuard();
	const middleware = [permissionMiddleware, cooldownMiddleware(), ...(options.middleware ?? [])];
	const buildRouter = (): Router => new Router(menuRegistry, sessions, middleware, { ...options, guard });
	let router = buildRouter();

	const commandBodies = () => {
		if (commandRegistry.some((c) => c.name === name)) throw new Error(`Command "/${name}" clashes with the menu command`);
		const menu = new SlashCommandBuilder().setName(name).setDescription(options.command?.description ?? 'Mở menu').toJSON();
		return [menu, ...commandRegistry.map(commandBody)];
	};

	const client = new Client(discordClientOptions(options.allowedMentions));
	const scheduler = new Scheduler(
		scheduledJobs.map((def) => ({
			name: `${def.ctor.name}.${def.method}`,
			spec: def.spec,
			run: () => callHook(def, client) as void | Promise<void>,
		})),
	);

	for (const hook of startHooks) await callHook(hook);

	const rest = new REST().setToken(options.token);
	let registered = '';
	const syncCommands = async (): Promise<void> => {
		const body = commandBodies();
		const key = JSON.stringify(body);
		if (key === registered) return;
		await rest.put(
			options.guildId
				? Routes.applicationGuildCommands(options.clientId, options.guildId)
				: Routes.applicationCommands(options.clientId),
			{ body },
		);
		registered = key;
		log.info({ commands: body.map((b) => b.name) }, 'slash commands registered');
	};
	await syncCommands();

	// an unhandled 'error' event would crash the process without a trace
	client.on(Events.Error, (err) => log.error({ err }, 'discord client error'));
	client.on(Events.Warn, (message) => log.warn({ message }, 'discord client warning'));
	client.on(Events.InteractionCreate, (i) => {
		if (i.isChatInputCommand()) {
			if (i.commandName === name) void router.open(i);
			else void dispatchCommand(i);
		} else if (i.isButton() || i.isAnySelectMenu() || i.isModalSubmit()) void router.handle(i);
	});
	client.once(Events.ClientReady, (c) => log.info({ tag: c.user.tag, menus: menuRegistry.length }, 'bot ready'));
	await client.login(options.token);
	scheduler.start();

	let stopWatching = (): void => undefined;
	if (options.hotReload) {
		const reload = createReloader(options.scan, async () => {
			const next = buildRouter(); // validates the new menus before swapping
			await syncCommands();
			router = next;
		});
		stopWatching = watchDirectories(options.scan, reload);
		log.info('hot reload on: menus and commands reload on save, services need a restart');
	}

	let stopping: Promise<void> | undefined;
	const stop = (): Promise<void> =>
		(stopping ??= (async () => {
			scheduler.stop();
			stopWatching();
			for (const hook of [...stopHooks].reverse()) {
				try {
					await callHook(hook);
				} catch (e) {
					log.error({ err: e }, '@OnStop hook failed');
				}
			}
			await client.destroy();
		})());

	if (options.handleSignals !== false) {
		for (const signal of ['SIGINT', 'SIGTERM'] as const) {
			process.once(signal, () => void stop().finally(() => process.exit(0)));
		}
	}
	return { client, stop };
}
