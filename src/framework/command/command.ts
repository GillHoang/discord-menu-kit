import {
	InteractionContextType,
	MessageFlags,
	PermissionsBitField,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type PermissionResolvable,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { container, type Class } from '../core/container.js';
import { getLogger, runWithRequest } from '../logging/logger.js';
import { UserError } from '../middleware/middleware.js';
import { assertAccess } from '../middleware/permissions.js';

export interface CommandOptions {
	description: string;
	/** add options / subcommands: `build: (b) => b.addStringOption(...)` */
	build?: (builder: SlashCommandBuilder) => unknown;
	/** members need these permissions to see the command by default (e.g. `['Administrator']`); also enforced when it runs */
	defaultMemberPermissions?: PermissionResolvable;
	guildOnly?: boolean;
}

export interface CommandDef {
	name: string;
	ctor: Class<BaseCommand>;
	options: CommandOptions;
}

/** Extra slash commands (admin tools…). Players still use the single menu command. */
export abstract class BaseCommand {
	abstract execute(interaction: ChatInputCommandInteraction): void | Promise<void>;
}

/** Filled by `@Command` while `*.command.ts` files are imported. */
export const commandRegistry: CommandDef[] = [];

export function Command(name: string, options: CommandOptions) {
	return (target: Class<BaseCommand>, _context: ClassDecoratorContext): void => {
		if (commandRegistry.some((c) => c.name === name)) throw new Error(`Duplicate command: ${name}`);
		commandRegistry.push({ name, ctor: target, options });
	};
}

export function commandBody(def: CommandDef): RESTPostAPIChatInputApplicationCommandsJSONBody {
	const b = new SlashCommandBuilder().setName(def.name).setDescription(def.options.description);
	if (def.options.guildOnly) b.setContexts(InteractionContextType.Guild);
	if (def.options.defaultMemberPermissions !== undefined) {
		b.setDefaultMemberPermissions(PermissionsBitField.resolve(def.options.defaultMemberPermissions));
	}
	def.options.build?.(b);
	return b.toJSON();
}

/** Same observability as menu interactions: requestId, duration, outcome. */
export async function dispatchCommand(i: ChatInputCommandInteraction): Promise<void> {
	const def = commandRegistry.find((c) => c.name === i.commandName);
	if (!def) return;
	await runWithRequest(
		{ interactionId: i.id, userId: i.user.id, guildId: i.guildId, action: `/${def.name}` },
		async () => {
			const log = getLogger();
			const started = performance.now();
			try {
				// Discord's default visibility can be overridden by server admins, so check at run time too
				const required = def.options.defaultMemberPermissions;
				assertAccess(i, {
					guildOnly: def.options.guildOnly ?? false,
					permissions: required === undefined ? [] : Array.isArray(required) ? required : [required],
				});
				await container.get(def.ctor).execute(i);
				log.info({ outcome: 'ok', durationMs: Math.round(performance.now() - started) }, 'command handled');
			} catch (e) {
				const user = e instanceof UserError;
				if (user) log.warn({ outcome: 'rejected' }, 'command rejected');
				else log.error({ err: e, outcome: 'error' }, 'command failed');
				const content = user ? e.message : 'Có lỗi xảy ra, thử lại sau nhé.';
				const payload = { content, flags: MessageFlags.Ephemeral } as const;
				await (i.replied || i.deferred ? i.followUp(payload) : i.reply(payload)).catch(() => undefined);
			}
		},
	);
}
