import fs from 'node:fs';
import path from 'node:path';

export type Kind = 'menu' | 'service' | 'command';
export const KINDS: readonly Kind[] = ['menu', 'service', 'command'];

const FOLDER: Record<Kind, string> = { menu: 'menus', service: 'services', command: 'commands' };

export const kebab = (s: string): string =>
	s
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();

export const pascal = (s: string): string =>
	kebab(s)
		.split('-')
		.filter(Boolean)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');

interface Vars {
	id: string;
	cls: string;
	/** import path of the framework index, relative to the generated file */
	fw: string;
	root: boolean;
}

const TEMPLATES: Record<Kind, (v: Vars) => string> = {
	menu: ({ id, cls, fw, root }) =>
		[
			`import { BaseMenu, Button, Menu, Nav, type MenuContext, type MenuView } from '${fw}';`,
			'',
			`@Menu('${id}'${root ? ', { root: true }' : ''})`,
			`export class ${cls}Menu extends BaseMenu {`,
			'\trender(ctx: MenuContext): MenuView {',
			'\t\treturn {',
			`\t\t\tcontent: '${cls}',`,
			root
				? "\t\t\tcomponents: [ctx.row(ctx.button('refresh', 'Làm mới'))],"
				: "\t\t\tcomponents: [ctx.row(ctx.button('back', 'Quay lại'))],",
			'\t\t};',
			'\t}',
			'',
			root ? "\t@Button('refresh')\n\trefresh(): Nav {\n\t\treturn Nav.stay();\n\t}" : "\t@Button('back')\n\tback(): Nav {\n\t\treturn Nav.back();\n\t}",
			'}',
			'',
		].join('\n'),
	service: ({ cls, fw }) =>
		[
			`import { Service } from '${fw}';`,
			'',
			'@Service()',
			`export class ${cls}Service {`,
			'\t// business logic goes here; inject it into menus with @Inject',
			'}',
			'',
		].join('\n'),
	command: ({ id, cls, fw }) =>
		[
			"import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';",
			`import { BaseCommand, Command } from '${fw}';`,
			'',
			`@Command('${id}', { description: '${cls}' })`,
			`export class ${cls}Command extends BaseCommand {`,
			'\tasync execute(interaction: ChatInputCommandInteraction): Promise<void> {',
			`\t\tawait interaction.reply({ content: '${id}', flags: MessageFlags.Ephemeral });`,
			'\t}',
			'}',
			'',
		].join('\n'),
};

function importPath(from: string, frameworkIndex: string): string {
	const rel = path.relative(path.dirname(from), frameworkIndex).split(path.sep).join('/');
	return rel.startsWith('.') ? rel : `./${rel}`;
}

export interface GenerateOptions {
	/** source root that contains `framework/` and the menus/services/commands folders */
	root?: string;
	cwd?: string;
	/** generate the menu as the root menu (`{ root: true }`) */
	rootMenu?: boolean;
}

/** Create `<root>/<menus|services|commands>/<name>.<kind>.ts`; never overwrites. Returns the relative path. */
export function generate(kind: Kind, rawName: string, options: GenerateOptions = {}): string {
	const id = kebab(rawName);
	if (!/^[a-z][a-z0-9-]*$/.test(id)) {
		throw new Error(`Tên không hợp lệ: "${rawName}" (bắt đầu bằng chữ cái, chỉ gồm chữ, số, gạch ngang)`);
	}
	const cwd = options.cwd ?? process.cwd();
	const root = options.root ?? 'src';
	const file = path.resolve(cwd, root, FOLDER[kind], `${id}.${kind}.ts`);
	if (fs.existsSync(file)) throw new Error(`Đã tồn tại: ${path.relative(cwd, file)}`);
	const fw = importPath(file, path.resolve(cwd, root, 'framework', 'index.js'));
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, TEMPLATES[kind]({ id, cls: pascal(id), fw, root: options.rootMenu ?? false }));
	return path.relative(cwd, file);
}

const MAIN_TS = [
	"import 'dotenv/config';",
	"import { dirname, join } from 'node:path';",
	"import { fileURLToPath } from 'node:url';",
	"import { startApp } from './framework/index.js';",
	'',
	'const here = dirname(fileURLToPath(import.meta.url));',
	'',
	'function required(name: string): string {',
	'\tconst value = process.env[name];',
	'\tif (!value) throw new Error(`Missing env ${name} (copy .env.example to .env)`);',
	'\treturn value;',
	'}',
	'',
	'await startApp({',
	"\ttoken: required('DISCORD_TOKEN'),",
	"\tclientId: required('DISCORD_CLIENT_ID'),",
	"\t...(process.env['DEV_GUILD_ID'] ? { guildId: process.env['DEV_GUILD_ID'] } : {}),",
	"\tscan: [join(here, 'menus'), join(here, 'services'), join(here, 'commands')],",
	"\thotReload: process.argv.includes('--hot'),",
	'});',
	'',
].join('\n');

/** New bot project: framework source copied to `src/framework` (you own the code), plus a root menu. */
export function scaffold(target: string, cwd: string = process.cwd()): string {
	const dir = path.resolve(cwd, target);
	if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`Thư mục không rỗng: ${dir}`);
	const kit = path.resolve(import.meta.dirname, '..');
	const own = JSON.parse(fs.readFileSync(path.join(kit, 'package.json'), 'utf8')) as Record<string, unknown>;
	const tsconfig = JSON.parse(fs.readFileSync(path.join(kit, 'tsconfig.json'), 'utf8')) as Record<string, unknown>;

	fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
	fs.cpSync(path.join(kit, 'src', 'framework'), path.join(dir, 'src', 'framework'), { recursive: true });
	for (const f of ['vitest.config.ts', '.env.example', '.gitignore']) fs.copyFileSync(path.join(kit, f), path.join(dir, f));

	const pkg = {
		name: kebab(path.basename(dir)) || 'my-bot',
		version: '0.0.0',
		private: true,
		type: 'module',
		scripts: {
			dev: 'tsx src/main.ts --hot',
			start: 'tsx src/main.ts',
			typecheck: 'tsc --noEmit',
			test: 'vitest run',
		},
		packageManager: own['packageManager'],
		dependencies: own['dependencies'],
		devDependencies: own['devDependencies'],
	};
	fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
	fs.writeFileSync(path.join(dir, 'tsconfig.json'), `${JSON.stringify({ ...tsconfig, include: ['src', 'tests'] }, null, 2)}\n`);
	fs.writeFileSync(path.join(dir, 'src', 'main.ts'), MAIN_TS);
	generate('menu', 'home', { cwd: dir, root: 'src', rootMenu: true });
	return dir;
}
