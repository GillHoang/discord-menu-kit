import { ButtonStyle } from 'discord.js';
import { BaseMenu, Button, Menu, Modal, Nav, Select, type MenuContext, type MenuView } from '../../src/framework/index.js';

const ITEMS = [
	{ label: 'Kiếm gỗ', value: 'wood-sword', description: '10 vàng' },
	{ label: 'Khiên sắt', value: 'iron-shield', description: '25 vàng' },
];

/** Shows select + modal + back navigation. Session `ctx.state` keeps the chosen item and nickname. */
@Menu('shop')
export class ShopMenu extends BaseMenu {
	render(ctx: MenuContext): MenuView {
		const item = ctx.state['item'] as string | undefined;
		const name = ctx.state['name'] as string | undefined;
		return {
			content: `**Cửa hàng**\nĐang chọn: ${item ?? '_chưa chọn_'}${name ? ` — đặt tên: ${name}` : ''}`,
			components: [
				ctx.select(
					'pick',
					ITEMS.map((i) => ({ ...i, default: i.value === item })),
					{ placeholder: 'Chọn món đồ' },
				),
				ctx.row(
					ctx.button('rename', 'Đặt tên', { disabled: !item }),
					ctx.button('back', 'Quay lại', { style: ButtonStyle.Secondary }),
				),
			],
		};
	}

	@Select('pick')
	pick(ctx: MenuContext): void {
		ctx.state['item'] = ctx.values[0];
	}

	@Button('rename')
	rename(ctx: MenuContext): Nav {
		return Nav.modal(ctx.modal('rename', 'Đặt tên cho món đồ', [{ id: 'name', label: 'Tên', placeholder: 'Ví dụ: Excalibur' }]));
	}

	@Modal('rename')
	renamed(ctx: MenuContext): void {
		ctx.state['name'] = ctx.field('name').slice(0, 32);
	}

	@Button('back')
	back(): Nav {
		return Nav.back();
	}
}
