import { describe, expect, it } from 'vitest';
import { decodeCustomId, encodeCustomId } from '../src/framework/custom-id.js';

describe('customId', () => {
	it('round-trips session, menu, action and args', () => {
		const id = encodeCustomId('ab12', 'shop', 'buy', ['sword', '3']);
		expect(id).toBe('km:ab12:shop:buy:sword:3');
		expect(decodeCustomId(id)).toEqual({ sessionId: 'ab12', menuId: 'shop', action: 'buy', args: ['sword', '3'] });
	});

	it('ignores foreign ids', () => {
		expect(decodeCustomId('other:1:2:3')).toBeNull();
		expect(decodeCustomId('km:only-two')).toBeNull();
	});

	it('rejects separators and overlong ids', () => {
		expect(() => encodeCustomId('s', 'm', 'a:b')).toThrow();
		expect(() => encodeCustomId('s', 'm', 'a', ['x'.repeat(100)])).toThrow(/too long/);
	});
});
