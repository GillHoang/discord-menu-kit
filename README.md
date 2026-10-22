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
| Xác nhận, wizard, zod | `Nav.confirm`, `WizardMenu`, `@Modal(id, { schema })` |
| Components V2 | `v2()`, `panel()`, `text()`; kiểm tra giới hạn 40 component lúc render |
| Menu hết hạn | làm xám nút cũ, nút "Mở lại menu" |
| Quan sát | pino + `requestId` (AsyncLocalStorage), thời gian xử lý mỗi interaction |
| Job nền | `@OnStart`, `@OnStop`, `@Scheduled` (cron hoặc chu kỳ) |
| Lệnh phụ | `@Command` cho admin, bên cạnh `/menu` |
| Dev | hot reload menu, CLI `pnpm menu-kit new / generate` |

## Tài liệu

- [Hướng dẫn sử dụng chi tiết](docs/huong-dan-su-dung.md)
- [Changelog](CHANGELOG.md)
- Mã ví dụ: thư mục [`example/`](example)

## Cấu trúc

```
src/framework/   lõi framework (copy hoặc import vào bot của bạn)
  core/          DI container, decorator, lifecycle (@OnStart, @Scheduled)
  menu/          BaseMenu, MenuContext, Nav, phân trang, V2, xác nhận, wizard
  routing/       Router, customId, chống trùng/nhấn đúp, menu hết hạn
  middleware/    middleware, cooldown, phân quyền
  session/       session và SessionStore
  command/       @Command (lệnh phụ)
  logging/       pino + requestId
  bootstrap/     startApp, quét thư mục, scheduler, hot reload
  index.ts       API công khai: import từ đây
example/         bot mẫu: main.ts, menus/, services/, commands/
cli/             pnpm menu-kit: new, generate
tests/           test và helper giả lập interaction
```
