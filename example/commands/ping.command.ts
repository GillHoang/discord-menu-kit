import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { BaseCommand, Command } from '../../src/framework/index.js';

/** Extra slash command next to `/menu`; handy for admin / health checks. */
@Command('ping', { description: 'Kiểm tra bot còn sống' })
export class PingCommand extends BaseCommand {
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.reply({ content: `Pong! ${Math.round(interaction.client.ws.ping)}ms`, flags: MessageFlags.Ephemeral });
	}
}
