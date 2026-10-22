export const CUSTOM_ID_PREFIX = 'km';
const SEP = ':';
const MAX_LENGTH = 100; // Discord limit

export interface DecodedCustomId {
	sessionId: string;
	menuId: string;
	action: string;
	args: string[];
}

/** `km:<sessionId>:<menuId>:<action>:<args...>` — keep long state in `ctx.state`, not in args. */
export function encodeCustomId(sessionId: string, menuId: string, action: string, args: readonly string[] = []): string {
	for (const part of [sessionId, menuId, action, ...args]) {
		if (part.includes(SEP)) throw new Error(`customId part contains "${SEP}": "${part}"`);
	}
	const id = [CUSTOM_ID_PREFIX, sessionId, menuId, action, ...args].join(SEP);
	if (id.length > MAX_LENGTH) throw new Error(`customId too long (${id.length} > ${MAX_LENGTH}): ${id}`);
	return id;
}

/** Returns null for ids that do not belong to this framework. */
export function decodeCustomId(id: string): DecodedCustomId | null {
	const [prefix, sessionId, menuId, action, ...args] = id.split(SEP);
	if (prefix !== CUSTOM_ID_PREFIX || !sessionId || !menuId || !action) return null;
	return { sessionId, menuId, action, args };
}
