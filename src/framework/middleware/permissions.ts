import type { APIInteractionGuildMember, GuildMember } from 'discord.js';
import { UserError, type Middleware } from './middleware.js';

function roleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
	if (!member) return [];
	return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/**
 * Enforces `guildOnly`, `permissions` and `roles` declared on a handler:
 *   @Button('ban', { permissions: ['BanMembers'] })
 *   @Button('vip', { roles: ['123456789012345678'] })   // any of the roles
 * Runs before the cooldown so rejected users do not burn their cooldown.
 */
export const permissionMiddleware: Middleware = async (ctx, { handler }, next) => {
	const { guildOnly, permissions, roles } = handler;
	if ((guildOnly || permissions.length > 0 || roles.length > 0) && !ctx.guildId) {
		throw new UserError('Chỉ dùng được trong server.');
	}
	if (permissions.length > 0 && !ctx.interaction.memberPermissions?.has(permissions)) {
		throw new UserError('Bạn không đủ quyền để thực hiện thao tác này.');
	}
	if (roles.length > 0) {
		const have = roleIds(ctx.interaction.member);
		if (!roles.some((r) => have.includes(r))) throw new UserError('Bạn không có vai trò phù hợp để thực hiện thao tác này.');
	}
	await next();
};
