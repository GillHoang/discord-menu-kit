# Hướng dẫn sử dụng discord-menu-kit

## Mục lục

1. [Khái niệm](#1-khái-niệm)
2. [Cài đặt và chạy](#2-cài-đặt-và-chạy)
3. [Khởi động bot (`startApp`)](#3-khởi-động-bot-startapp)
4. [Viết menu](#4-viết-menu)
5. [Handler: button, select, modal](#5-handler-button-select-modal)
6. [Điều hướng (`Nav`)](#6-điều-hướng-nav)
7. [`MenuContext`](#7-menucontext)
8. [Service và DI](#8-service-và-di)
9. [Session và state](#9-session-và-state)
10. [Middleware, cooldown, phân quyền](#10-middleware-cooldown-phân-quyền)
11. [Handler chạy lâu và chống nhấn đúp](#11-handler-chạy-lâu-và-chống-nhấn-đúp)
12. [Phân trang](#12-phân-trang)
13. [Viết test](#13-viết-test)
14. [Lưu ý và lỗi thường gặp](#14-lưu-ý-và-lỗi-thường-gặp)
15. [Mở rộng](#15-mở-rộng)

---

## 1. Khái niệm

```
/menu ──► Router.open ──► tạo Session ──► render menu gốc (@Menu root)
                                              │ người dùng bấm button/select/modal
                                              ▼
 customId: km:<sessionId>:<menuId>:<action>:<args>
                                              │
 Router.handle ─► guard (trùng/khóa) ─► kiểm tra chủ menu ─► middleware ─► handler
                                              │ trả về Nav (hoặc không trả gì)
                                              ▼
                              cập nhật session ─► render lại ─► sửa tin nhắn tại chỗ
```

- **Menu**: một class kế thừa `BaseMenu`, vừa là view (`render`) vừa là controller (các handler).
- **Handler**: method gắn `@Button(id)`, `@Select(id)` hoặc `@Modal(id)`; chạy khi người dùng tương tác với component có `action` đó.
- **Nav**: giá trị handler trả về để chọn bước tiếp theo. Không trả gì nghĩa là render lại menu hiện tại.
- **Session**: bộ nhớ tạm của một lần mở menu (stack điều hướng và `ctx.state`), hết hạn sau 15 phút không dùng.
- **Service**: class chứa logic nghiệp vụ, được inject vào menu bằng `@Inject`.

## 2. Cài đặt và chạy

Yêu cầu Node.js 22+ và pnpm.

```bash
pnpm install
cp .env.example .env
```

Điền `.env`:

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DISCORD_TOKEN` | có | Token bot (Discord Developer Portal → Bot) |
| `DISCORD_CLIENT_ID` | có | Application ID |
| `DEV_GUILD_ID` | không | Có thì đăng ký slash vào server này (có hiệu lực ngay); không có thì đăng ký global (có thể mất tới 1 giờ) |

Mời bot vào server với scope `bot` và `applications.commands`. Bot chỉ cần intent `Guilds`.

```bash
pnpm dev        # tsx watch example/main.ts
pnpm start      # chạy một lần
pnpm test
pnpm typecheck
```

Cấu hình TypeScript: dùng **decorator chuẩn TC39**, không bật `experimentalDecorators`, không cần `reflect-metadata`. Import tương đối phải có đuôi `.js` (NodeNext), ví dụ `import { X } from './x.service.js'`.

## 3. Khởi động bot (`startApp`)

```ts
import { startApp } from '../src/framework/index.js';

await startApp({
  token, clientId,
  guildId: process.env.DEV_GUILD_ID,           // tùy chọn
  command: { name: 'menu', description: 'Mở menu' },
  scan: [join(here, 'menus'), join(here, 'services')],
});
```

| Option | Mặc định | Ý nghĩa |
|---|---|---|
| `token`, `clientId` | bắt buộc | Thông tin bot |
| `guildId` | global | Đăng ký lệnh vào một server |
| `command` | `{ name: 'menu', description: 'Mở menu' }` | Slash duy nhất mở menu gốc |
| `scan` | bắt buộc | Các thư mục được quét (đệ quy) |
| `middleware` | `[]` | Middleware thêm vào sau permission và cooldown |
| `sessions` | `MemorySessionStore` (TTL 15 phút) | Nơi lưu session (`SessionStore`) |
| `ephemeral` | `false` | `true` thì menu chỉ người mở nhìn thấy |
| `onError` | `console.error` | Nhận lỗi không mong muốn từ handler |
| `messages` | tiếng Việt | Đổi 3 thông báo `expired`, `notOwner`, `error` |
| `guard` | `InteractionGuard` mới | Thay cơ chế chống trùng/khóa |

Thứ tự lúc boot: quét thư mục (decorator tự đăng ký) → tạo sẵn mọi `@Service` để lỗi wiring nổ ngay → đăng ký slash → đăng nhập → định tuyến interaction.

**Quy tắc quét:** chỉ import file tên `*.menu.ts` hoặc `*.service.ts` (cũng nhận `.js`, `.mjs`, `.cjs`). File tên khác sẽ không được nạp, nên menu đặt sai đuôi sẽ không xuất hiện.

## 4. Viết menu

Tạo `example/menus/profile.menu.ts`:

```ts
import { ButtonStyle } from 'discord.js';
import { BaseMenu, Button, Menu, Nav, type MenuContext, type MenuView } from '../../src/framework/index.js';

@Menu('profile')                       // id duy nhất; menu gốc thì thêm { root: true }
export class ProfileMenu extends BaseMenu {
  render(ctx: MenuContext): MenuView {
    return {
      content: `Hồ sơ của **${ctx.user.displayName}**`,
      components: [ctx.row(ctx.button('back', 'Quay lại', { style: ButtonStyle.Secondary }))],
    };
  }

  @Button('back')
  back() { return Nav.back(); }
}
```

Quy tắc:

- Phải có **đúng một** menu `{ root: true }` (đó là menu `/menu` mở ra). Thiếu hoặc thừa thì `Router` ném lỗi lúc khởi tạo.
- `id` menu không được trùng và không được chứa dấu `:`.
- `render(ctx)` trả về `MenuView` (payload tin nhắn thường: `content`, `embeds`, `components`, `files`). Không gọi `interaction.reply` trong `render`.
- Hook tùy chọn `onEnter(ctx)` chạy mỗi khi menu này trở thành menu đang hiển thị: lúc mở, `Nav.to` tới nó, hoặc `Nav.back` về nó.
- Để vào menu này từ menu khác: `Nav.to('profile')` trong một handler.

## 5. Handler: button, select, modal

```ts
@Button('buy')                          // customId action = "buy"
buy(ctx: MenuContext) { ... }

@Select('pick')                         // mọi loại select menu
pick(ctx: MenuContext) { const first = ctx.values[0]; }

@Modal('rename')                        // submit của modal
renamed(ctx: MenuContext) { const name = ctx.field('name'); }
```

Handler là method của menu, có thể `async`, trả về `Nav | void`. Bộ ba (loại, id) phải duy nhất trong một menu.

Tuỳ chọn thứ hai của decorator:

| Option | Ý nghĩa |
|---|---|
| `cooldownMs` | Cooldown theo người dùng và handler |
| `slow` | Ack bằng `deferUpdate()` trước khi chạy (mục 11) |
| `guildOnly` | Từ chối trong DM |
| `permissions` | Quyền Discord bắt buộc, ví dụ `['BanMembers']` |
| `roles` | Cần ít nhất một role id trong danh sách |

### Tạo component trong `render`

```ts
ctx.row(
  ctx.button('inc', '+1', { style: ButtonStyle.Primary }),
  ctx.button('buy', 'Mua', { args: [itemId], disabled: !canBuy, emoji: '🛒' }),
)
```

`ctx.button(action, label, { style, args, disabled, emoji })` sinh customId trỏ về handler `action` của chính menu đang render. `args` đọc lại bằng `ctx.args` trong handler.

```ts
ctx.select('pick', [
  { label: 'Kiếm gỗ', value: 'wood-sword', description: '10 vàng', default: current === 'wood-sword' },
], { placeholder: 'Chọn món đồ', min: 1, max: 1 })   // trả về ActionRow, đặt thẳng vào components
```

`ctx.select` tạo string select. Với user/role/channel select, tự dựng builder discord.js và dùng `ctx.cid('action')` làm customId; handler vẫn là `@Select`.

### Modal

```ts
@Button('rename')
rename(ctx: MenuContext) {
  return Nav.modal(ctx.modal('rename', 'Đặt tên', [
    { id: 'name', label: 'Tên', placeholder: 'Ví dụ: Excalibur', required: true, style: TextInputStyle.Short },
  ]));
}

@Modal('rename')
renamed(ctx: MenuContext) { ctx.state['name'] = ctx.field('name').slice(0, 32); }
```

`ctx.modal(action, ...)` gắn submit vào `@Modal(action)` của cùng menu. Sau khi submit, tin nhắn menu được sửa tại chỗ và render lại.

## 6. Điều hướng (`Nav`)

| Trả về | Hiệu ứng |
|---|---|
| (không trả gì) / `Nav.stay()` | Render lại menu hiện tại |
| `Nav.to('menu-id', ...args)` | Đẩy menu khác lên stack, `ctx.args` của nó là `args` |
| `Nav.back()` | Về menu trước (không làm gì nếu đang ở gốc) |
| `Nav.close()` | Xóa toàn bộ component và hủy session |
| `Nav.modal(modal)` | Mở modal (xem mục 5) |

`Nav.to` tới id không tồn tại sẽ báo lỗi. `Nav.modal` không dùng được trong handler `@Modal`, hoặc khi interaction đã được ack (ví dụ `slow: true`).

## 7. `MenuContext`

| Thành viên | Dùng ở | Ý nghĩa |
|---|---|---|
| `user`, `guildId` | mọi nơi | Người dùng và server (`null` nếu DM) |
| `interaction` | mọi nơi | Interaction gốc của discord.js (dùng khi cần việc nâng cao) |
| `args` | mọi nơi | Handler: args trong customId. `render`: args của `Nav.to` |
| `state` | mọi nơi | Dữ liệu session (mục 9) |
| `values` | `@Select` | Giá trị đã chọn |
| `field(id)` | `@Modal` | Giá trị ô nhập của modal |
| `menuId`, `session` | mọi nơi | Thông tin menu/session hiện tại |
| `cid(action, ...args)` | `render` | Tạo customId thủ công |
| `button`, `row`, `select`, `modal` | `render`/handler | Helper dựng component |
| `paginate(items, opts)` | `render` | Phân trang (mục 12) |

`customId` có dạng `km:<sessionId>:<menuId>:<action>:<args…>`, tối đa 100 ký tự và không phần nào được chứa `:`. Đừng nhét dữ liệu dài vào `args`; hãy đặt vào `ctx.state`.

## 8. Service và DI

```ts
@Service()
export class ShopService {
  @Inject(ItemRepository) private readonly items!: ItemRepository;   // service inject service
  async buy(userId: string, itemId: string) { ... }
}

@Menu('shop')
export class ShopMenu extends BaseMenu {
  @Inject(ShopService) private readonly shop!: ShopService;          // menu inject service
}
```

- Mỗi class là **singleton**, tạo lười khi dùng lần đầu; mọi `@Service` còn được tạo sớm lúc boot để lỗi wiring lộ ra ngay.
- Chỉ **inject theo field** (khai báo `!` vì giá trị do decorator gán). Constructor của bean không nhận tham số.
- Tránh vòng phụ thuộc giữa các service (A inject B, B inject A trong lúc khởi tạo sẽ lặp vô hạn). Hãy tách logic chung ra service thứ ba.
- Thay bean khi test: `container.provide(ShopService, fake)`; dọn bằng `container.reset()`.

## 9. Session và state

Mỗi lần `/menu` tạo một session mới: `{ id, ownerId, stack, state, expiresAt }`.

- `ctx.state` là object tự do, được lưu lại sau mỗi handler. Phù hợp cho món đang chọn, bộ lọc, số trang. **Chỉ nên chứa dữ liệu JSON** nếu sau này bạn chuyển sang Redis.
- Session hết hạn sau 15 phút kể từ lần lưu cuối. Bấm vào menu đã hết hạn sẽ nhận thông báo `messages.expired`.
- Người khác bấm vào menu của bạn nhận `messages.notOwner`.
- `MemorySessionStore` mất dữ liệu khi restart. Muốn bền hoặc chạy nhiều process, viết một lớp implement `SessionStore` (`create`, `get`, `save`, `delete`; có thể async) rồi truyền qua `startApp({ sessions })`.

## 10. Middleware, cooldown, phân quyền

Middleware giống filter: `(ctx, info, next) => Promise<void>`. Gọi `next()` để đi tiếp, ném `UserError` để từ chối (người dùng thấy thông báo ephemeral).

```ts
import { UserError, type Middleware } from '../src/framework/index.js';

const maintenance: Middleware = async (ctx, { menuId, handler }, next) => {
  if (isMaintenance()) throw new UserError('Bot đang bảo trì.');
  await next();
};

await startApp({ /* ... */, middleware: [maintenance] });
```

`info` chứa `menuId` và `handler` (có `kind`, `id`, `cooldownMs`, `slow`, `permissions`, `roles`…). Thứ tự chạy: **permission → cooldown → middleware của bạn → handler**.

Ví dụ khai báo:

```ts
@Button('ban', { permissions: ['BanMembers'], cooldownMs: 3000 })
@Button('vip', { roles: ['123456789012345678'] })     // cần ít nhất một role trong danh sách
@Button('guild', { guildOnly: true })
```

Lỗi `UserError` chỉ hiển thị cho người dùng; các lỗi khác được ghi qua `onError` và người dùng thấy `messages.error`.

Lưu ý: phân quyền áp dụng cho **handler**, không áp dụng cho việc xem menu. Nếu menu chứa dữ liệu nhạy cảm, kiểm tra quyền trong chính handler dẫn tới nó (ví dụ handler `Nav.to('admin')`).

## 11. Handler chạy lâu và chống nhấn đúp

Discord chỉ cho 3 giây để phản hồi. Handler gọi DB/API chậm cần ack sớm:

```ts
@Button('refresh', { slow: true })
async refresh(ctx: MenuContext) {
  this.data = await this.api.fetchLeaderboard();   // có thể mất vài giây
}
```

Router sẽ `deferUpdate()` trước khi chạy handler, sau đó gửi kết quả bằng `editReply`. Ràng buộc:

- **Không** trả `Nav.modal` từ handler `slow` (modal phải là phản hồi đầu tiên). Nút mở modal đừng đánh dấu `slow`.
- Nếu quên `slow` mà handler chạy quá 3 giây, người dùng thấy "interaction failed". Router không tự đoán.
- Lỗi ném ra sau khi đã defer được gửi bằng `followUp` ephemeral.

Chống nhấn đúp (tự động, không cần cấu hình):

- Interaction lặp cùng `id` bị bỏ qua.
- Mỗi session chỉ chạy một handler tại một thời điểm. Click thêm khi handler đang chạy được ack im lặng và bỏ qua, nên mua hàng hai lần chỉ chạy một lần.

Cả hai cơ chế chỉ có tác dụng trong **một process**.

## 12. Phân trang

```ts
render(ctx: MenuContext): MenuView {
  const page = ctx.paginate(this.shop.items(), { pageSize: 5 });
  return {
    content: page.items.map((i) => `• ${i.name}`).join('\n') + `\nTrang ${page.page + 1}/${page.pages}`,
    components: [page.row],                       // ◀  2/5  ▶
  };
}
```

- `page.items`: phần tử của trang hiện tại; `page.page` bắt đầu từ 0; `page.total`: tổng số phần tử.
- Trang được lưu trong `ctx.state` và tự giới hạn trong khoảng hợp lệ (danh sách ngắn lại thì không bị trang ma).
- Nút ◀ ▶ do router xử lý (action dành riêng `~page`); menu không cần viết handler.
- Nhiều danh sách trong một menu: đặt `key` khác nhau (`{ key: 'inventory' }`, `key` không chứa `:`).
- Muốn quay về trang đầu khi đổi bộ lọc: `ctx.state['page:default'] = 0` (hoặc `page:<key>`).

## 13. Viết test

Test dùng vitest, không cần kết nối Discord. Mẫu dựa trên `tests/router-safety.test.ts`:

```ts
import { fakeClick } from './helpers/fake-interaction.js';

const sessions = new MemorySessionStore();
const router = new Router(menuRegistry, sessions, [permissionMiddleware, cooldownMiddleware()]);
const session = sessions.create('u1', 'shop-root');

const click = fakeClick(session.id, 'shop-root', 'buy', { args: ['sword'], permissions: ['BanMembers'] });
await router.handle(click as never);
expect(click.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Đã mua') }));
```

`fakeClick` nhận các tuỳ chọn `userId`, `guildId` (`null` = DM), `permissions`, `roles`, `args`. Mỗi lần gọi tạo `interaction.id` mới; dùng lại cùng một object để thử trường hợp trùng id.

Lưu ý: `menuRegistry` là toàn cục theo từng file test (vitest cô lập module), và phải có đúng một menu gốc trong file đó. Thay service bằng bản giả với `container.provide(...)`.

`vitest.config.ts` có plugin esbuild vì transformer mặc định của Vitest 5 chưa hạ cấp được decorator chuẩn; đừng xóa nó.

Fake interaction không mô phỏng giới hạn 3 giây, nên hãy kiểm tra thủ công với Discord thật cho các handler `slow`.

## 14. Lưu ý và lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Menu/service không được nhận | Tên file không kết thúc `.menu.ts` / `.service.ts`, hoặc thư mục không có trong `scan` |
| `Exactly one @Menu(id, { root: true }) is required` | Chưa có hoặc có nhiều hơn một menu gốc |
| `Duplicate menu id` / `Duplicate @button handler` | Trùng id menu hoặc trùng (loại, id) handler |
| `customId part contains ":"` | `id`, `action` hoặc `args` chứa dấu `:` |
| `customId too long` | Nhét dữ liệu dài vào `args`; chuyển sang `ctx.state` |
| `No @button handler "x" on menu "y"` | Component render với action không có handler (gõ sai tên, hoặc menu đã đổi sau khi deploy) |
| "This interaction failed" | Handler chạy quá 3 giây mà thiếu `slow: true` |
| `Nav.modal needs an unacknowledged interaction` | Trả `Nav.modal` từ handler `slow` |
| Field `@Inject` bị `undefined` | Bean được tạo bằng `new` thủ công thay vì qua container |
| Slash không hiện | Đăng ký global có độ trễ; dùng `DEV_GUILD_ID` khi phát triển |
| Menu cũ báo hết hạn sau khi restart | `MemorySessionStore` không bền; dùng store ngoài |

## 15. Mở rộng

- **Session bền (Redis):** implement `SessionStore` và truyền vào `startApp({ sessions })`.
- **Nhiều process:** thay `InteractionGuard` bằng bản dùng khóa Redis và truyền qua `guard`.
- **Phân quyền riêng:** viết thêm middleware đọc cấu hình của bạn.
- **Dùng trong bot có sẵn:** `Router` độc lập với `startApp`; tự tạo `new Router(menuRegistry, sessions, middleware, options)`, gọi `router.open(interaction)` cho slash và `router.handle(interaction)` cho button, select, modal.
- **Thêm tính năng:** chỉ cần thêm file `*.menu.ts` hoặc `*.service.ts`; không có bước đăng ký nào khác.
