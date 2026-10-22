import { generate, scaffold, KINDS, type Kind } from './templates.js';

const USAGE = [
	'menu-kit — scaffolding cho discord-menu-kit',
	'',
	'  pnpm menu-kit new <thư-mục>                              tạo project bot mới (kèm mã framework)',
	'  pnpm menu-kit generate <menu|service|command> <tên> [--dir src]',
	'                                                           sinh file vào <dir>/menus | services | commands',
].join('\n');

function parse(argv: readonly string[]): { positional: string[]; flags: Record<string, string> } {
	const positional: string[] = [];
	const flags: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg.startsWith('--')) flags[arg.slice(2)] = argv[++i] ?? '';
		else positional.push(arg);
	}
	return { positional, flags };
}

function main(argv: readonly string[]): void {
	const { positional, flags } = parse(argv);
	const [command, a, b] = positional;
	try {
		if (command === 'new' && a) {
			const dir = scaffold(a);
			console.log(`Đã tạo ${dir}\nTiếp theo:\n  cd ${a}\n  pnpm install\n  cp .env.example .env\n  pnpm dev`);
		} else if ((command === 'generate' || command === 'g') && a && b && KINDS.includes(a as Kind)) {
			console.log(`Đã tạo ${generate(a as Kind, b, { root: flags['dir'] || 'src' })}`);
		} else {
			console.log(USAGE);
			process.exitCode = 1;
		}
	} catch (e) {
		console.error(`Lỗi: ${(e as Error).message}`);
		process.exitCode = 1;
	}
}

main(process.argv.slice(2));
