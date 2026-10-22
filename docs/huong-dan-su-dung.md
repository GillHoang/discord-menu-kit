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
13. [Hộp xác nhận (`Nav.confirm`)](#13-hộp-xác-nhận-navconfirm)
14. [Wizard nhiều bước](#14-wizard-nhiều-bước)
15. [Validate modal bằng zod](#15-validate-modal-bằng-zod)
16. [Components V2](#16-components-v2)
17. [Menu hết hạn](#17-menu-hết-hạn)
18. [Logging và requestId](#18-logging-và-requestid)
19. [Lifecycle và job nền](#19-lifecycle-và-job-nền)
20. [Lệnh phụ `@Command`](#20-lệnh-phụ-command)
21. [Hot reload](#21-hot-reload)
22. [CLI `menu-kit`](#22-cli-menu-kit)
23. [Viết test](#23-viết-test)
24. [Lưu ý và lỗi thường gặp](#24-lưu-ý-và-lỗi-thường-gặp)
25. [Mở rộng](#25-mở-rộng)

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
| `messages` | tiếng Việt | Đổi một phần các thông báo: `expired`, `notOwner`, `error`, `reopen`, `closed` |
| `guard` | `InteractionGuard` mới | Thay cơ chế chống trùng/khóa |
| `autoDefer` | tắt | Số ms; handler chạy quá ngưỡng này sẽ được `deferUpdate()` tự động (mục 11) |
| `disableExpired` | `true` | Làm xám nút của menu hết hạn khi có người bấm (mục 17) |
| `logger` | pino mặc định | Logger pino của bạn (mục 18) |
| `hotReload` | `false` | Nạp lại menu/command khi lưu file, chỉ dùng khi phát triển (mục 21) |
| `handleSignals` | `true` | Dừng sạch khi nhận SIGINT / SIGTERM |
| `allowedMentions` | `{ parse: [] }` | Mention nào trong tin nhắn của bot được phép ping. Mặc định không ai bị ping, nên chữ do người dùng nhập (tên hiển thị…) không thể kích hoạt `@everyone` / role; đặt `{ parse: ['users'] }`… khi cần |

Thứ tự lúc boot: quét thư mục (decorator tự đăng ký) → tạo sẵn mọi `@Service` để lỗi wiring nổ ngay → chạy `@OnStart` → đăng ký slash (menu và `@Command`) → đăng nhập → bắt đầu `@Scheduled` → định tuyến interaction.

`startApp` trả về `App { client, stop() }`. `stop()` chạy các `@OnStop`, dừng job, rồi ngắt kết nối; mặc định nó tự được gọi khi nhận SIGINT / SIGTERM.

**Quy tắc quét:** chỉ import file tên `*.menu.ts`, `*.service.ts` hoặc `*.command.ts` (cũng nhận `.js`, `.mjs`, `.cjs`). File tên khác sẽ không được nạp, nên menu đặt sai đuôi sẽ không xuất hiện. Thư mục không tồn tại được bỏ qua.

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
- `id` menu không được trùng, không chứa dấu `:` và không bắt đầu bằng `~` (dành riêng cho thành phần nội bộ như `~confirm`).
- `render(ctx)` trả về `MenuView` (payload tin nhắn thường: `content`, `embeds`, `components`, `files`). Không gọi `interaction.reply` trong `render`.
- Hook tùy chọn `onEnter(ctx)` chạy mỗi khi menu này trở thành menu đang hiển thị: lúc mở, `Nav.to` tới nó, hoặc `Nav.back` về nó.
- `@Menu(id, { guildOnly, permissions, roles })` đặt quyền cho cả menu (mục 10).
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
| `Nav.confirm({ message, onYes, args })` | Hỏi xác nhận trước khi chạy `@Button(onYes)` (mục 13) |

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

### Quyền cho cả menu

Cùng bộ luật `guildOnly` / `permissions` / `roles` đặt được trên `@Menu`:

```ts
@Menu('admin', { permissions: ['Administrator'] })
export class AdminMenu extends BaseMenu { /* ... */ }
```

Router áp dụng chúng ở **mọi** đường vào menu đó: mở menu, `Nav.to('admin')` (bị từ chối trước khi đụng tới stack nên session vẫn nguyên), `Nav.back`, mọi `@Button/@Select/@Modal` của nó, và các action dành riêng như Hoàn tất của `WizardMenu` hay nút phân trang. Đây là cách duy nhất bảo vệ `onFinish` của wizard (nó không phải một handler có decorator). Luật ở cấp handler vẫn dùng được thêm cho từng nút.

Từ chối luôn là tin ephemeral ("Bạn không đủ quyền…"); quyền lấy từ người đang bấm, trong kênh đang bấm.

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
- Nếu quên `slow` mà handler chạy quá 3 giây, người dùng thấy "interaction failed". Muốn có lưới an toàn, bật `startApp({ autoDefer: 2500 })`: handler nào còn chạy sau 2,5 giây sẽ được `deferUpdate()` tự động. Đổi lại, handler đó không thể trả `Nav.modal` nữa (modal phải là phản hồi đầu tiên), nên nút mở modal vẫn phải nhanh.
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

## 13. Hộp xác nhận (`Nav.confirm`)

Dùng cho thao tác nguy hiểm (xóa, mua, ban):

```ts
@Button('delete')
askDelete(ctx: MenuContext) {
  return Nav.confirm({ message: 'Xóa vật phẩm này?', onYes: 'doDelete', args: [itemId] });
}

@Button('doDelete', { slow: true })
async doDelete(ctx: MenuContext) {
  await this.items.remove(ctx.args[0]!);
  return Nav.back();
}
```

- Hiện một bước xác nhận với hai nút (mặc định "Đồng ý" / "Hủy", đổi bằng `yesLabel`, `noLabel`).
- "Đồng ý" chạy `@Button(onYes)` của **menu hiện tại** với `args`, và đi qua đầy đủ middleware của handler đó (phân quyền, cooldown, `slow`). "Hủy" quay lại menu cũ.
- `onYes` phải là một `@Button` có thật, nếu không sẽ báo lỗi ngay lúc `Nav.confirm`.
- Sau `onYes`, giá trị `Nav` trả về được xử lý như bình thường (không trả gì thì render lại menu gốc).

## 14. Wizard nhiều bước

Kế thừa `WizardMenu`, khai báo `steps`, viết handler thường để điền dữ liệu, rồi xử lý ở `onFinish`:

```ts
type Draft = { name?: string };

@Menu('create-character')
export class CreateCharacterMenu extends WizardMenu<Draft> {
  readonly steps: readonly WizardStep<Draft>[] = [
    {
      id: 'name', title: 'Tên nhân vật',
      render: (ctx, d) => ({ content: `Tên: ${d.name ?? '-'}`, components: [ctx.row(ctx.button('rename', 'Nhập tên'))] }),
      validate: (d) => (d.name ? null : 'Bạn cần nhập tên trước'),
    },
    { id: 'confirm', title: 'Xác nhận', render: () => ({ content: 'Tạo nhân vật?' }) },
  ];
  readonly finishSlow = true;   // onFinish gọi DB: defer trước khi chạy

  @Button('rename')
  rename(ctx: MenuContext) { return Nav.modal(ctx.modal('setname', 'Tên', [{ id: 'name', label: 'Tên' }])); }

  @Modal('setname', { schema: z.object({ name: z.string().min(3) }) })
  setName(ctx: MenuContext) { this.data(ctx).name = ctx.input<{ name: string }>().name; }

  async onFinish(ctx: MenuContext, data: Draft) { await this.characters.create(ctx.user.id, data.name!); }
}
```

- Nút **Quay lại / Hủy / Tiếp** (bước cuối là **Hoàn tất**) tự được thêm vào cuối mỗi bước; router xử lý chúng.
- "Tiếp" bị chặn và hiện lời nhắn ephemeral khi `validate` của bước hiện tại trả về chuỗi.
- Tiêu đề "Bước i/n: ..." được thêm vào `content` (với Components V2 thì không tự thêm).
- `onFinish` trả `Nav` như handler thường; không trả gì thì `Nav.close()`. "Hủy" về menu trước (hoặc đóng nếu là menu đầu).
- Tiến độ nằm trong `ctx.state` (khóa `wiz:<menuId>`), xóa khi hoàn tất hoặc hủy. Giữ `data` ở dạng JSON.

## 15. Validate modal bằng zod

```ts
@Modal('rename', { schema: z.object({ name: z.string().min(3, 'ít nhất 3 ký tự') }) })
renamed(ctx: MenuContext) {
  const { name } = ctx.input<{ name: string }>();   // đã được parse
}
```

- Schema nhận một object có khóa là `id` của các ô nhập, giá trị là chuỗi (dùng `z.coerce.number()` v.v. để đổi kiểu).
- Sai thì handler **không chạy**; người dùng nhận tin ephemeral dạng danh sách `• name: ít nhất 3 ký tự`. Discord không cho mở lại modal từ một lần submit, nên họ bấm nút mở modal lần nữa.
- Chạy sau middleware (phân quyền, cooldown), ngay trước handler.

## 16. Components V2

```ts
render(ctx: MenuContext) {
  return v2(panel([
    text('## Cửa hàng'),
    separator(),
    ctx.row(ctx.button('buy', 'Mua')),
  ], 0x5865f2));
}
```

- Dùng `v2()`, `panel()` (container), `text()`, `separator()`, hoặc trực tiếp builder của discord.js (`SectionBuilder`, `MediaGalleryBuilder`…). Router tự gắn cờ `IsComponentsV2` ở mọi lần gửi/sửa.
- Không dùng chung với `content`, `embeds`, `poll`, `stickers`; vi phạm thì báo lỗi ngay lúc render, kèm id menu.
- Giới hạn **40 component tổng cộng** (tính cả component lồng nhau: container, text, hàng, nút…); tin nhắn thường tối đa 5 hàng. Vượt thì báo lỗi rõ ràng thay vì lỗi mơ hồ từ Discord.
- Một session nên dùng một loại: toàn tin nhắn thường hoặc toàn V2 (Discord không cho đổi loại của một tin nhắn đã gửi). Hộp xác nhận tự theo loại hiện tại.
- `Nav.close()` trên tin nhắn V2 thay nội dung bằng dòng `messages.closed` (V2 không được rỗng).

## 17. Menu hết hạn

Khi ai đó bấm vào menu đã hết hạn (session mất sau TTL hoặc restart):

- các nút của tin nhắn cũ bị làm xám (tắt bằng `disableExpired: false`);
- người đó nhận tin ephemeral "Menu đã hết hạn" kèm nút **Mở lại menu** (`messages.reopen`) để tạo menu mới ngay;
- bấm menu của **người khác** chỉ nhận lời nhắc và nút mở lại; menu của họ không bị đụng tới.

Việc làm xám xảy ra "lười", đúng lúc có người bấm, không có bộ hẹn giờ nào chạy ngầm.

## 18. Logging và requestId

- Dùng pino, xuất JSON ra stdout; mức log lấy từ biến môi trường `LOG_LEVEL` (mặc định `info`). Xem đẹp khi dev: `pnpm dev | npx pino-pretty`. Dùng logger riêng bằng `startApp({ logger })`.
- Mỗi interaction chạy trong một `AsyncLocalStorage`, nên **mọi dòng log** (kể cả log của service gọi trong handler) có `requestId`, `interactionId`, `userId`, `guildId`, `menuId`, `action`.
- Cuối mỗi interaction có một dòng tổng kết:

```json
{"level":30,"requestId":"3f9a1c2e","userId":"123","menuId":"shop","action":"buy","outcome":"ok","durationMs":42,"msg":"interaction handled"}
```

  `outcome`: `ok`, `rejected` (`UserError`, hết hạn, sai chủ), `ignored` (nhấn đúp bị bỏ qua), `error`.
- Lỗi bất ngờ có thêm dòng `handler failed` kèm `err` và cùng `requestId` với dòng tổng kết; người dùng chỉ thấy thông báo chung. Hook `onError` (nếu có) vẫn được gọi.
- Trong code của bạn: `ctx.log.info({ itemId }, 'bought')` hoặc `getLogger()` (trong service cũng có `requestId`). Job nền và `@Command` ghi log tương tự (job có thêm trường `job`).

## 19. Lifecycle và job nền

Chỉ dùng trong class `@Service`:

```ts
@Service()
export class MaintenanceService {
  @OnStart() async init() { await this.db.connect(); }          // trước khi bot đăng nhập
  @OnStop()  async shutdown() { await this.db.close(); }        // khi tắt bot

  @Scheduled('0 * * * *')        async hourly(client: Client) { /* mỗi giờ */ }
  @Scheduled({ every: '5m' })    async poll() { /* mỗi 5 phút */ }
}
```

- `@Scheduled` nhận **cron 5 trường** (`phút giờ ngày tháng thứ`, giờ của máy chủ; hỗ trợ `*`, `a-b`, `*/n`, danh sách `1,15`; thứ `0` hoặc `7` là Chủ nhật; đặt cả ngày lẫn thứ thì khớp một trong hai) hoặc `{ every: '30s' | '5m' | '2h' | <ms> }` (tối đa khoảng 24,8 ngày vì giới hạn timer của Node; dài hơn thì dùng cron, quá ngưỡng sẽ báo lỗi lúc boot). Một trường cron bắt đầu bằng `*` (kể cả `*/2`) coi như không ràng buộc khi xét ngày với thứ. Method nhận `client` của discord.js.
- Một job không bao giờ chạy chồng lên chính nó (lần sau bị bỏ qua và ghi cảnh báo). Lỗi trong job được log, không làm sập bot. Spec sai sẽ báo lỗi ngay lúc boot.
- `@OnStart` chạy tuần tự theo thứ tự import, trước khi đăng nhập (lỗi ở đây làm bot không khởi động). `@OnStop` chạy theo thứ tự ngược khi nhận SIGINT / SIGTERM hoặc gọi `app.stop()`; tắt bằng `handleSignals: false` nếu bạn tự quản.

## 20. Lệnh phụ `@Command`

Người chơi vẫn chỉ cần `/menu`; `@Command` dành cho lệnh quản trị hay kiểm tra:

```ts
// commands/ban.command.ts
@Command('ban', {
  description: 'Cấm người dùng',
  guildOnly: true,
  defaultMemberPermissions: ['BanMembers'],
  build: (b) => b.addUserOption((o) => o.setName('user').setDescription('Ai').setRequired(true)),
})
export class BanCommand extends BaseCommand {
  @Inject(ModerationService) private readonly moderation!: ModerationService;

  async execute(i: ChatInputCommandInteraction) { /* ... */ }
}
```

- Đặt trong file `*.command.ts`; class được tạo qua DI nên dùng được `@Inject`.
- Được đăng ký cùng `/menu` trong một lần gửi lên Discord (ghi đè toàn bộ lệnh của bot). Tên không được trùng lệnh mở menu.
- `defaultMemberPermissions` và `guildOnly` được **kiểm tra lại mỗi lần lệnh chạy**, không chỉ quyết định ai thấy lệnh: quản trị server có thể đổi quyền hiển thị trong Integrations, nên không được dựa vào đó để bảo vệ lệnh nguy hiểm.
- Ném `UserError` để báo lỗi cho người dùng (ephemeral); lỗi khác được log và người dùng thấy thông báo chung. Có log `requestId` và thời gian xử lý như menu.

## 21. Hot reload

```bash
pnpm dev        # = tsx example/main.ts --hot
```

hoặc `startApp({ hotReload: true })`. Khi bạn lưu một file `*.menu.ts` / `*.command.ts`:

- bot nạp lại mà **không đăng nhập lại Discord**; các session đang mở giữ nguyên và render bằng menu mới ở lần bấm tiếp theo;
- slash command được đăng ký lại nếu định nghĩa thay đổi;
- nếu file lỗi (cú pháp, thiếu menu gốc…), bot ghi log lỗi và **giữ bản cũ**.

Giới hạn: service và các file phụ trợ mà menu import (helper, hằng số) **không** được nạp lại, hãy khởi động lại bot khi sửa chúng; service giữ nguyên instance và trạng thái. Chỉ dùng khi phát triển.

Chi tiết: lưu liên tiếp được gộp và không bao giờ có hai lần reload chạy chồng nhau; thư mục trong `scan` phải tồn tại lúc khởi động thì mới được theo dõi (thư mục thiếu bị bỏ qua kèm cảnh báo), nên tạo sẵn `services/` và `commands/` nếu muốn hot reload file mới trong đó.

## 22. CLI `menu-kit`

```bash
pnpm menu-kit new ../my-bot                    # project mới, đã có framework và một menu gốc
pnpm menu-kit generate menu shop-items         # src/menus/shop-items.menu.ts
pnpm menu-kit generate service payments        # src/services/payments.service.ts
pnpm menu-kit generate command ban-user        # src/commands/ban-user.command.ts
pnpm menu-kit generate menu shop --dir app     # dùng thư mục gốc khác (mặc định src)
```

- `new` sao chép mã framework vào `src/framework` của project mới (bạn sở hữu mã, không phụ thuộc gói npm), cùng `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example` và `src/main.ts`. Sau đó: `pnpm install`, `cp .env.example .env`, `pnpm dev`.
- `generate` không bao giờ ghi đè file có sẵn; tên được chuyển sang kebab-case (`ShopItems` → `shop-items`) và tên class tương ứng.
- Dự án chưa được publish lên npm, nên `npx create-menu-kit` chưa dùng được; hiện chạy bằng `pnpm menu-kit` trong repo này.

## 23. Viết test

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

## 24. Lưu ý và lỗi thường gặp

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
| `Menu "x": N component, vượt giới hạn 40` | Menu Components V2 có quá nhiều component (đếm cả lồng nhau) |
| `Menu "x" dùng Components V2 nên không được có: content` | Trộn `content`/`embeds` với component V2 |
| `Nav.confirm: menu "x" has no @Button("y")` | `onYes` không trỏ tới một `@Button` của menu hiện tại |
| `Cron needs 5 fields` / `Invalid interval` | Sai `@Scheduled` (lỗi lúc boot) |
| `Command "/x" clashes with the menu command` | `@Command` trùng tên với lệnh mở menu |
| Hot reload không thấy thay đổi của service | Service và file phụ trợ không được nạp lại, hãy restart |
| Tin nhắn V2 đổi sang tin thường (hoặc ngược lại) bị Discord từ chối | Một session chỉ nên dùng một loại tin nhắn |
| Mention `@user` / `@role` trong tin của bot không ping | Mặc định `allowedMentions: { parse: [] }`; đặt `startApp({ allowedMentions })` nếu cần ping |
| Lệnh `@Command` báo "không đủ quyền" dù đã chỉnh quyền trong Integrations | Quyền trong `defaultMemberPermissions` được kiểm tra lúc chạy lệnh |

## 25. Mở rộng

- **Session bền (Redis):** implement `SessionStore` và truyền vào `startApp({ sessions })`.
- **Nhiều process:** thay `InteractionGuard` bằng bản dùng khóa Redis và truyền qua `guard`.
- **Phân quyền riêng:** viết thêm middleware đọc cấu hình của bạn.
- **Dùng trong bot có sẵn:** `Router` độc lập với `startApp`; tự tạo `new Router(menuRegistry, sessions, middleware, options)`, gọi `router.open(interaction)` cho slash và `router.handle(interaction)` cho button, select, modal.
- **Thêm tính năng:** chỉ cần thêm file `*.menu.ts` hoặc `*.service.ts`; không có bước đăng ký nào khác.
