import { ButtonStyle } from 'discord.js';
import { BaseMenu, Button, Inject, Menu, Nav, type MenuContext, type MenuView } from '../../src/framework/index.js';
import { CounterService } from '../services/counter.service.js';

/** Root menu: what `/menu` opens. */
@Menu('home', { root: true })
export class HomeMenu extends BaseMenu {
	@Inject(CounterService) private readonly counter!: CounterService;

	render(ctx: MenuContext): MenuView {
		return {
			content: `Xin chào **${ctx.user.displayName}**! Bạn đã bấm **${this.counter.get(ctx.user.id)}** lần.`,
			components: [
				ctx.row(
					ctx.button('inc', '+1', { style: ButtonStyle.Primary }),
					ctx.button('shop', 'Cửa hàng'),
					ctx.button('close', 'Đóng', { style: ButtonStyle.Danger }),
				),
			],
		};
	}

	@Button('inc', { cooldownMs: 500 })
	inc(ctx: MenuContext): void {
		this.counter.increment(ctx.user.id); // returning nothing = re-render this menu
	}

	@Button('shop')
	shop(): Nav {
		return Nav.to('shop');
	}

	@Button('close')
	close(): Nav {
		return Nav.close();
	}
}
