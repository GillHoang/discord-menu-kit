# discord-menu-kit

Khung làm việc cho bot Discord (discord.js + TypeScript): **một slash command mở menu**, mọi button, select và modal trong menu được định tuyến tới các handler khai báo bằng decorator, dùng DI kiểu Spring Boot.

```ts
@Menu('shop')
export class ShopMenu extends BaseMenu {
  @Inject(ShopService) private readonly shop!: ShopService;

  render(ctx: MenuContext) {
    const page = ctx.paginate(this.shop.items(), { pageSize: 5 });
    return { content: page.items.map((i) => i.name).join('\n'), components: [page.row, ctx.row(ctx.button('back', 'Quay lại'))] };
  }

  @Button('back') back() { return Nav.back(); }
  @Button('buy', { slow: true, cooldownMs: 1000 }) async buy(ctx: MenuContext) { await this.shop.buy(ctx.user.id, ctx.args[0]!); }
  @Button('ban', { permissions: ['BanMembers'] }) ban() { /* ... */ }
}
```

## Bắt đầu nhanh

Yêu cầu: Node.js 22+, pnpm.

```bash
pnpm install
cp .env.example .env     # điền DISCORD_TOKEN, DISCORD_CLIENT_ID (DEV_GUILD_ID để đăng ký lệnh tức thì)
pnpm dev                 # chạy example/, gõ /menu trong Discord
pnpm test                # test
pnpm typecheck           # kiểm tra kiểu
```

## Có gì

| Tính năng | Mô tả |
|---|---|
| Một slash, nhiều menu | `/menu` mở menu gốc; điều hướng bằng `Nav.to / back / close` |
| Decorator | `@Menu @Button @Select @Modal @Service @Inject` |
| Tự quét | Thêm file `*.menu.ts` hoặc `*.service.ts` là đủ, không cần đăng ký |
| Session | stack điều hướng và `ctx.state`, chỉ chủ menu bấm được |
| Middleware | cooldown, phân quyền, tự viết thêm |
| Ack chậm và chống nhấn đúp | `slow: true`, khóa theo session, dedupe theo `interaction.id` |
| Phân trang | `ctx.paginate()`, nút ◀ ▶ tự xử lý |

## Tài liệu

- [Hướng dẫn sử dụng chi tiết](docs/huong-dan-su-dung.md)
- [Changelog](CHANGELOG.md)
- Mã ví dụ: thư mục [`example/`](example)

## Cấu trúc

```
src/framework/   lõi framework (copy hoặc import vào bot của bạn)
example/         bot mẫu: main.ts, menus/, services/
tests/           test và helper giả lập interaction
```
