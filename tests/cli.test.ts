import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generate, kebab, pascal, scaffold } from '../cli/templates.js';

const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-kit-cli-'));
	dirs.push(d);
	return d;
};
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('names', () => {
	it('converts to kebab and Pascal case', () => {
		expect(kebab('Shop Items')).toBe('shop-items');
		expect(kebab('shopItems')).toBe('shop-items');
		expect(pascal('shop-items')).toBe('ShopItems');
	});
});

describe('generate', () => {
	it('writes a menu with the right id, class and framework import', () => {
		const cwd = tmp();
		const rel = generate('menu', 'Shop Items', { cwd });
		expect(rel.split(path.sep).join('/')).toBe('src/menus/shop-items.menu.ts');
		const code = fs.readFileSync(path.join(cwd, rel), 'utf8');
		expect(code).toContain("from '../framework/index.js'");
		expect(code).toContain("@Menu('shop-items')");
		expect(code).toContain('export class ShopItemsMenu extends BaseMenu');
	});

	it('supports root menus, services and commands in a custom root', () => {
		const cwd = tmp();
		expect(fs.readFileSync(path.join(cwd, generate('menu', 'home', { cwd, root: 'app', rootMenu: true })), 'utf8')).toContain(
			"@Menu('home', { root: true })",
		);
		expect(fs.readFileSync(path.join(cwd, generate('service', 'payments', { cwd, root: 'app' })), 'utf8')).toContain(
			'export class PaymentsService',
		);
		const cmd = fs.readFileSync(path.join(cwd, generate('command', 'ban-user', { cwd, root: 'app' })), 'utf8');
		expect(cmd).toContain("@Command('ban-user'");
		expect(cmd).toContain('export class BanUserCommand extends BaseCommand');
	});

	it('refuses to overwrite and rejects bad names', () => {
		const cwd = tmp();
		generate('menu', 'shop', { cwd });
		expect(() => generate('menu', 'shop', { cwd })).toThrow(/Đã tồn tại/);
		expect(() => generate('menu', '123', { cwd })).toThrow(/Tên không hợp lệ/);
		expect(() => generate('menu', '!!!', { cwd })).toThrow(/Tên không hợp lệ/);
	});
});

describe('scaffold', () => {
	it('creates a runnable project layout with the framework copied in', () => {
		const dir = path.join(tmp(), 'My Bot');
		scaffold(dir);
		const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
			name: string;
			scripts: Record<string, string>;
			dependencies: Record<string, string>;
		};
		expect(pkg.name).toBe('my-bot');
		expect(pkg.scripts['dev']).toContain('--hot');
		expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['discord.js', 'pino', 'zod']));
		for (const f of ['src/main.ts', 'src/framework/index.ts', 'tsconfig.json', '.env.example', 'vitest.config.ts']) {
			expect(fs.existsSync(path.join(dir, f))).toBe(true);
		}
		expect(fs.readFileSync(path.join(dir, 'src/menus/home.menu.ts'), 'utf8')).toContain('{ root: true }');
	});

	it('refuses a non-empty directory', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'keep.txt'), 'x');
		expect(() => scaffold(dir)).toThrow(/không rỗng/);
	});
});
