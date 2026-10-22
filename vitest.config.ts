import { transform } from 'esbuild';
import { defineConfig, type Plugin } from 'vitest/config';

// Vitest's default (oxc) transformer cannot lower standard TC39 decorators, esbuild can.
const esbuildDecorators: Plugin = {
	name: 'esbuild-ts-decorators',
	enforce: 'pre',
	async transform(code, id) {
		if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
		const out = await transform(code, { loader: 'ts', target: 'es2022', sourcemap: true, sourcefile: id });
		return { code: out.code, map: out.map };
	},
};

export default defineConfig({
	plugins: [esbuildDecorators],
	test: { env: { LOG_LEVEL: 'silent' } },
});
