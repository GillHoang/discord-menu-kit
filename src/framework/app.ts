import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { container } from './container.js';
import { menuRegistry, serviceRegistry } from './decorators.js';
import { cooldownMiddleware, type Middleware } from './middleware.js';
import { Router, type RouterOptions } from './router.js';
import { scanDirectory } from './scan.js';
import { MemorySessionStore, type SessionStore } from './session.js';

export interface AppOptions extends RouterOptions {
	token: string;
	clientId: string;
	/** register the command to this guild only (instant); omit for global registration */
	guildId?: string;
	/** the single slash command that opens the root menu */
	command?: { name?: string; description?: string };
	/** directories scanned for `*.menu.ts` and `*.service.ts` */
	scan: string[];
	middleware?: Middleware[];
	sessions?: SessionStore;
}

/** Boot everything: scan → wire beans → register the slash command → login → route interactions. */
export async function startApp(options: AppOptions): Promise<Client> {
	for (const dir of options.scan) await scanDirectory(dir);
	for (const service of serviceRegistry) container.get(service); // fail fast on broken wiring

	const name = options.command?.name ?? 'menu';
	const router = new Router(
		menuRegistry,
		options.sessions ?? new MemorySessionStore(),
		[cooldownMiddleware(), ...(options.middleware ?? [])],
		options,
	);

	const body = new SlashCommandBuilder()
		.setName(name)
		.setDescription(options.command?.description ?? 'Mở menu')
		.toJSON();
	const rest = new REST().setToken(options.token);
	await rest.put(
		options.guildId
			? Routes.applicationGuildCommands(options.clientId, options.guildId)
			: Routes.applicationCommands(options.clientId),
		{ body: [body] },
	);

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	client.on(Events.InteractionCreate, (i) => {
		if (i.isChatInputCommand() && i.commandName === name) void router.open(i);
		else if (i.isButton() || i.isAnySelectMenu() || i.isModalSubmit()) void router.handle(i);
	});
	client.once(Events.ClientReady, (c) => console.log(`Ready as ${c.user.tag}, /${name} → ${menuRegistry.length} menu(s)`));
	await client.login(options.token);
	return client;
}
