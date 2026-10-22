import { existsSync, watch } from 'node:fs';
import { commandRegistry } from '../command/command.js';
import { menuRegistry } from '../core/decorators.js';
import { getLogger } from '../logging/logger.js';
import { scanDirectory } from './scan.js';

// only menus and commands are reloaded: services keep their instances (and state) across reloads
const RELEVANT = /\.(menu|command)\.[cm]?[jt]s$/;

/**
 * Call `onChange` (debounced) when a `*.menu.ts` / `*.command.ts` file under `dirs` changes.
 * Directories that do not exist are skipped (and logged): `fs.watch` would throw on them.
 * Returns a function that stops watching.
 */
export function watchDirectories(dirs: readonly string[], onChange: () => void | Promise<void>, debounceMs = 200): () => void {
	const existing = dirs.filter((d) => existsSync(d));
	const missing = dirs.filter((d) => !existsSync(d));
	if (missing.length > 0) getLogger().warn({ dirs: missing }, 'hot reload: directory does not exist yet, not watched');

	let timer: NodeJS.Timeout | undefined;
	const watchers = existing.map((dir) => {
		const watcher = watch(dir, { recursive: true }, (_event, filename) => {
			if (!filename || !RELEVANT.test(String(filename))) return;
			clearTimeout(timer);
			timer = setTimeout(() => void onChange(), debounceMs);
		});
		watcher.on('error', (err) => getLogger().warn({ err, dir }, 'hot reload watcher error'));
		return watcher;
	});
	return () => {
		clearTimeout(timer);
		for (const w of watchers) w.close();
	};
}

export type Rescan = (dir: string) => Promise<unknown>;

let reloadVersion = 0;
/** Re-import menus and commands, bypassing the ESM cache with a fresh `?v=` each time. */
const defaultRescan: Rescan = (dir) => scanDirectory(dir, { kinds: ['menu', 'command'], cacheBust: ++reloadVersion });

/**
 * Build the function that performs a hot reload: clear the menu/command registries, re-import, then `apply`
 * (validate the new menus and swap them in). Failure restores the previous registries.
 * Reloads never overlap; saves that arrive meanwhile are coalesced into one follow-up reload.
 */
export function createReloader(
	dirs: readonly string[],
	apply: () => Promise<void>,
	rescan: Rescan = defaultRescan,
): () => Promise<void> {
	let running = false;
	let again = false;

	const reloadOnce = async (): Promise<void> => {
		const log = getLogger();
		const menus = [...menuRegistry];
		const commands = [...commandRegistry];
		menuRegistry.length = 0;
		commandRegistry.length = 0;
		try {
			for (const dir of dirs) await rescan(dir);
			await apply();
			log.info({ menus: menuRegistry.length, commands: commandRegistry.length }, 'hot reload ok');
		} catch (err) {
			menuRegistry.splice(0, menuRegistry.length, ...menus);
			commandRegistry.splice(0, commandRegistry.length, ...commands);
			log.error({ err }, 'hot reload failed, keeping the previous menus');
		}
	};

	return async () => {
		if (running) {
			again = true;
			return;
		}
		running = true;
		try {
			do {
				again = false;
				await reloadOnce();
			} while (again);
		} finally {
			running = false;
		}
	};
}
