import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULE_FILE = /\.(menu|service)\.[cm]?[jt]s$/;

/**
 * Component scan: import every `*.menu.ts` / `*.service.ts` below `dir`.
 * Importing is enough — the `@Menu` / `@Service` decorators self-register.
 */
export async function scanDirectory(dir: string): Promise<number> {
	let count = 0;
	for (const entry of await readdir(resolve(dir), { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !MODULE_FILE.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
		await import(pathToFileURL(join(entry.parentPath, entry.name)).href);
		count++;
	}
	return count;
}
