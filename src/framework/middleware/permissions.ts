import type { APIInteractionGuildMember, GuildMember, PermissionResolvable } from 'discord.js';
import type { MenuInteraction } from '../menu/context.js';
import { UserError, type Middleware } from './middleware.js';

/** Who may use something: a handler (`@Button('x', rules)`), a whole menu (`@Menu('x', rules)`) or a command. */
export interface AccessRules {
	/** reject DMs */
	guildOnly?: boolean;
	/** member needs all of these permissions (implies guildOnly) */
	permissions?: readonly PermissionResolvable[];
	/** member needs at least one of these role ids (implies guildOnly) */
	roles?: readonly string[];
}

function roleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
	if (!member) return [];
	return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/** Throws `UserError` (shown ephemerally) when the interaction's member does not satisfy `rules`. */
export function assertAccess(i: MenuInteraction, rules: AccessRules): void {
	const { guildOnly = false, permissions = [], roles = [] } = rules;
	if ((guildOnly || permissions.length > 0 || roles.length > 0) && !i.guildId) {
		throw new UserError('Chỉ dùng được trong server.');
	}
	if (permissions.length > 0 && !i.memberPermissions?.has([...permissions])) {
		throw new UserError('Bạn không đủ quyền để thực hiện thao tác này.');
	}
	if (roles.length > 0) {
		const have = roleIds(i.member);
		if (!roles.some((r) => have.includes(r))) throw new UserError('Bạn không có vai trò phù hợp để thực hiện thao tác này.');
	}
}

/**
 * Enforces `guildOnly`, `permissions` and `roles` declared on a handler:
 *   @Button('ban', { permissions: ['BanMembers'] })
 *   @Button('vip', { roles: ['123456789012345678'] })   // any of the roles
 * Runs before the cooldown so rejected users do not burn their cooldown.
 * The same rules on a menu (`@Menu(id, rules)`) are enforced by the router for every action of that menu.
 */
export const permissionMiddleware: Middleware = async (ctx, { handler }, next) => {
	assertAccess(ctx.interaction, handler);
	await next();
};
