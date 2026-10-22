import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ModuleKind = 'menu' | 'service' | 'command';

const MODULE_FILE = /\.(menu|service|command)\.[cm]?[jt]s$/;

export interface ScanOptions {
	/** only import these kinds (hot reload re-imports menus and commands only) */
	kinds?: readonly ModuleKind[];
	/** append `?v=<n>` to bypass the ESM cache and re-evaluate the module */
	cacheBust?: number;
}

/**
 * Component scan: import every `*.menu.ts` / `*.service.ts` / `*.command.ts` below `dir`.
 * Importing is enough — the `@Menu` / `@Service` / `@Command` decorators self-register.
 * A missing directory is skipped, so projects can start with only the folders they use.
 */
export async function scanDirectory(dir: string, options: ScanOptions = {}): Promise<number> {
	let entries;
	try {
		entries = await readdir(resolve(dir), { withFileTypes: true, recursive: true });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 0;
		throw e;
	}
	let count = 0;
	for (const entry of entries) {
		const kind = MODULE_FILE.exec(entry.name)?.[1] as ModuleKind | undefined;
		if (!entry.isFile() || !kind || entry.name.endsWith('.d.ts')) continue;
		if (options.kinds && !options.kinds.includes(kind)) continue;
		const url = pathToFileURL(join(entry.parentPath, entry.name)).href;
		await import(options.cacheBust ? `${url}?v=${options.cacheBust}` : url);
		count++;
	}
	return count;
}
