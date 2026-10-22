import type { BaseMessageOptions } from 'discord.js';
import type { MenuContext } from './context.js';

/** What a menu renders: a normal Discord message payload (content / embeds / components / files). */
export type MenuView = BaseMessageOptions;

/**
 * Base class of every menu (a "controller" + "view" in one).
 *
 *   @Menu('shop')
 *   class ShopMenu extends BaseMenu {
 *     render(ctx) { ... }
 *     @Button('buy') buy(ctx) { ... }
 *   }
 */
export abstract class BaseMenu {
	/** Build the message. Must be pure w.r.t. Discord I/O (it may read services and `ctx.state`). */
	abstract render(ctx: MenuContext): MenuView | Promise<MenuView>;

	/** Optional hook: runs every time this menu becomes the visible one (open, `Nav.to`, `Nav.back`). */
	onEnter?(ctx: MenuContext): void | Promise<void>;
}
