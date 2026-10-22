import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from '../src/framework/index.js';

const here = dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env ${name} (copy .env.example to .env)`);
	return value;
}

await startApp({
	token: required('DISCORD_TOKEN'),
	clientId: required('DISCORD_CLIENT_ID'),
	...(process.env['DEV_GUILD_ID'] ? { guildId: process.env['DEV_GUILD_ID'] } : {}),
	command: { name: 'menu', description: 'Mở menu của bot' },
	scan: [join(here, 'menus'), join(here, 'services')],
});
