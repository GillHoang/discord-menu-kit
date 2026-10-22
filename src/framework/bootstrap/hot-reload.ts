import { watch } from 'node:fs';

// only menus and commands are reloaded: services keep their instances (and state) across reloads
const RELEVANT = /\.(menu|command)\.[cm]?[jt]s$/;

/**
 * Call `onChange` (debounced) when a `*.menu.ts` / `*.command.ts` file under `dirs` changes.
 * Returns a function that stops watching.
 */
export function watchDirectories(dirs: readonly string[], onChange: () => void | Promise<void>, debounceMs = 200): () => void {
	let timer: NodeJS.Timeout | undefined;
	const watchers = dirs.map((dir) =>
		watch(dir, { recursive: true }, (_event, filename) => {
			if (!filename || !RELEVANT.test(String(filename))) return;
			clearTimeout(timer);
			timer = setTimeout(() => void onChange(), debounceMs);
		}),
	);
	return () => {
		clearTimeout(timer);
		for (const w of watchers) w.close();
	};
}
