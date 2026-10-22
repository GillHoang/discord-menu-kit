# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), version theo [SemVer](https://semver.org/lang/vi/).
Khi còn `0.x`, API có thể thay đổi giữa các bản minor.

## [0.2.1] - 2026-10-22

Sửa các lỗi tìm thấy khi review toàn bộ codebase (bảo mật, độ bền, hot reload).

### Bảo mật

- **Không ai bị ping ngoài ý muốn**: `Client` mặc định `allowedMentions: { parse: [] }`. Trước đây chữ do người dùng kiểm soát (tên hiển thị, nội dung nhập) được menu in lại có thể chứa `@everyone` / mention role. Đổi bằng `startApp({ allowedMentions })`.
- **`@Command` kiểm tra quyền lúc chạy**: `defaultMemberPermissions` và `guildOnly` giờ được áp dụng khi lệnh thực thi, vì quản trị server có thể đổi quyền hiển thị mặc định của Discord. Trước đây chỉ là quyền hiển thị.
- **Quyền cấp menu**: `@Menu(id, { guildOnly, permissions, roles })` áp cho mọi action của menu (kể cả action dành riêng như `~wiz` / `~page`), khi mở menu, khi `Nav.to` / `Nav.back` và khi xác nhận `Nav.confirm`. Trước đây `onFinish` của `WizardMenu` không đi qua middleware nên không thể bảo vệ bằng quyền. `assertAccess()` được export để dùng lại.

### Sửa lỗi

- **Hot reload**: `fs.watch` không còn ném `ENOENT` khi thư mục `scan` chưa tồn tại (project vừa `menu-kit new` sập ngay khi `pnpm dev`); thư mục thiếu bị bỏ qua kèm cảnh báo. Các lần reload không còn chạy chồng nhau (lưu liên tiếp được gộp), lỗi thì khôi phục registry cũ.
- **Scheduler**: `every` vượt 2^31-1 ms (ví dụ `'720h'`) bị từ chối thay vì bị Node ép thành 1 ms (job chạy dồn dập). Cron `*/n` ở trường ngày/thứ giờ hiểu như Vixie cron (AND thay vì OR).
- **Session id** dài 48 bit (12 ký tự hex) và không bao giờ ghi đè session còn sống (trước đây 32 bit, xác suất trùng ≈ 1,2% ở 10.000 session).
- **Cooldown** dọn các mục đã hết hạn thay vì tăng mãi.
- Bắt `Events.Error` / `Events.Warn` của discord.js và ghi log, thay vì để sự kiện `error` không ai nghe làm sập tiến trình.

### Thay đổi

- Fake interaction trong test mô phỏng đúng luật ack của discord.js (phản hồi đầu tiên chỉ một lần; `editReply` / `followUp` cần ack trước), nên test bắt được ack đôi.
- Dọn style: tách thông báo và xử lý lỗi của router sang `routing/replies.ts` (`router.ts` còn 190 dòng, API không đổi: `RouterMessages` vẫn export từ `router.ts`); bỏ các `as never` trong mã nguồn bằng kiểu đúng của discord.js; thêm `"license": "UNLICENSED"` vào `package.json` (project đang `private`).
- `MenuDef` có thêm `guildOnly`, `permissions`, `roles`; `cooldownMiddleware(now, until)` và `MemorySessionStore(ttl, now, newId)` nhận tham số tuỳ chọn.

## [0.2.0] - 2026-10-22

Quan sát được (observability), menu bền hơn, nhiều công cụ cho người viết bot.

### Thêm

- **Logging** (pino): mỗi interaction chạy trong `AsyncLocalStorage` với `requestId`; mọi dòng log kèm `userId`, `guildId`, `menuId`, `action`. Cuối mỗi interaction có dòng `interaction handled` với `outcome` (`ok` / `rejected` / `ignored` / `error`) và `durationMs`. `getLogger()`, `ctx.log`, `startApp({ logger })`, `LOG_LEVEL`.
- **Menu hết hạn**: bấm menu hết hạn thì các nút của tin nhắn cũ bị làm xám (`disableExpired`, mặc định bật) và người dùng nhận tin ephemeral có nút "Mở lại menu" (`messages.reopen`). Bấm menu của người khác cũng có nút mở lại.
- **Components V2**: `v2()`, `panel()`, `text()`, `separator()` hoặc builder discord.js; tự gắn cờ `IsComponentsV2`; kiểm tra giới hạn 40 component (đếm cả lồng nhau), 5 hàng với tin nhắn thường, và cấm `content`/`embeds` cùng V2, báo lỗi rõ tên menu ngay lúc render.
- **`Nav.confirm({ message, onYes, args })`**: bước xác nhận dùng lại được; "Đồng ý" chạy `@Button(onYes)` (qua đủ middleware), "Hủy" quay lại.
- **`WizardMenu`**: form nhiều bước với Quay lại / Hủy / Tiếp tự sinh, `validate` theo bước, `onFinish`, `finishSlow`.
- **Validate modal bằng zod**: `@Modal('x', { schema })`, lỗi hiển thị cho người dùng, đọc kết quả bằng `ctx.input<T>()`.
- **Lifecycle và job nền** trong `@Service`: `@OnStart()`, `@OnStop()`, `@Scheduled('0 * * * *')` / `@Scheduled({ every: '5m' })`. Job không chồng lấp, lỗi được log, spec sai báo lỗi lúc boot.
- **`autoDefer`**: `startApp({ autoDefer: 2500 })` tự `deferUpdate()` khi handler chạy quá ngưỡng.
- **`@Command`** (`*.command.ts`): thêm slash command phụ (admin…) bên cạnh `/menu`, có log và xử lý lỗi như menu.
- **Hot reload** (`hotReload: true`, `pnpm dev`): nạp lại `*.menu.ts` / `*.command.ts` khi lưu mà không đăng nhập lại; lỗi thì giữ bản cũ.
- **CLI** `pnpm menu-kit`: `new <dir>` tạo project mới (kèm mã framework), `generate menu|service|command <tên>`.
- `startApp` tự dừng sạch khi nhận SIGINT / SIGTERM (`handleSignals`).

### Thay đổi

- **`startApp` trả về `App { client, stop() }`** thay vì `Client` (dùng `app.client`).
- `RouterOptions.messages` nhận một phần (`Partial`) và có thêm `reopen`, `closed`.
- Lỗi bất ngờ được ghi bằng pino (`handler failed`) thay vì `console.error`; `onError` vẫn được gọi thêm.
- `scanDirectory` bỏ qua thư mục không tồn tại và nhận thêm `*.command.ts`.
- Id menu bắt đầu bằng `~` hoặc chứa `:` bị từ chối (dành riêng cho thành phần nội bộ).
- Router được tách thành `presenter`, `navigator`, `handler-runner`, `expiry`, `builtin-actions`.

### Lưu ý

- Một session nên dùng một loại tin nhắn: toàn tin nhắn thường hoặc toàn Components V2 (Discord không cho đổi loại của một tin nhắn).
- Hot reload chỉ nạp lại menu và command; service và file phụ trợ cần khởi động lại.

## [0.1.2] - 2026-10-22

Tổ chức lại `src/framework/` theo thư mục, không đổi hành vi.

### Thay đổi

- Các file được nhóm theo vai trò: `core/` (container, decorators), `menu/` (menu, context, nav, paginate), `routing/` (router, custom-id, guard), `middleware/` (middleware, permissions), `session/` (session), `bootstrap/` (app, scan).
- `src/framework/index.ts` giữ nguyên API công khai. Code import từ `index.js` không cần sửa; chỉ import sâu theo đường dẫn file cũ (ví dụ `framework/router.js`) phải đổi sang đường dẫn mới (`framework/routing/router.js`).
- Cập nhật `README.md` và `CLAUDE.md` theo cấu trúc mới.

## [0.1.1] - 2026-10-22

Chỉ thêm tài liệu, không đổi hành vi của framework.

### Thêm

- `README.md`: giới thiệu, bắt đầu nhanh, bảng tính năng.
- `docs/huong-dan-su-dung.md`: hướng dẫn sử dụng chi tiết (15 mục).
- `CHANGELOG.md`.
- `CLAUDE.md`: hướng dẫn cho Claude Code khi làm việc trong repo.

## [0.1.0] - 2026-10-22

Bản làm cho bot chạy ổn định trên Discord thật: chống nhấn đúp, ack chậm, phân quyền, phân trang.

### Thêm

- **Chống trùng và nhấn đúp** (`InteractionGuard`, `src/framework/guard.ts`)
  - Bỏ qua interaction gửi lại với cùng `interaction.id`.
  - Mỗi session chỉ chạy một handler tại một thời điểm; click thừa khi handler đang chạy được `deferUpdate()` rồi bỏ qua.
  - Có thể truyền guard riêng qua `RouterOptions.guard` / `startApp({ guard })`.
- **Ack chậm**: `@Button('x', { slow: true })` (cũng áp dụng cho `@Select`, `@Modal`) tự `deferUpdate()` trước khi chạy handler, kết quả gửi bằng `editReply`.
- **Phân quyền** (`permissionMiddleware`, `src/framework/permissions.ts`), khai báo trên handler:
  - `guildOnly: true`: từ chối DM.
  - `permissions: ['BanMembers']`: member phải có đủ các quyền (kéo theo `guildOnly`).
  - `roles: ['id1', 'id2']`: member phải có ít nhất một role (kéo theo `guildOnly`).
  - `startApp` nạp middleware này mặc định, đặt trước cooldown.
- **Phân trang**: `ctx.paginate(items, { pageSize, key })` trả về `{ items, page, pages, total, row }`. Nút ◀ ▶ do router xử lý qua action dành riêng `~page`, menu không cần viết handler.
- Test helper `tests/helpers/fake-interaction.ts` và bộ test `tests/router-safety.test.ts`.

### Thay đổi

- `HandlerDef` có thêm `slow`, `guildOnly`, `permissions`, `roles`.
- `Router.update` dùng `editReply` khi interaction đã được ack (defer), `update` trong trường hợp còn lại.
- `Nav.modal` ném lỗi rõ ràng nếu interaction đã được ack (ví dụ handler đánh dấu `slow`).
- Chuỗi middleware mặc định của `startApp`: `permissionMiddleware` → `cooldownMiddleware` → middleware của bạn.

### Giới hạn đã biết

- `InteractionGuard` và `MemorySessionStore` chỉ có tác dụng trong một process. Chạy nhiều process cần bản dùng Redis.
- Không tự defer khi handler chạy quá 3 giây; phải khai báo `slow: true` thủ công.

## [0.0.1] - 2026-10-22

Bản đầu tiên: khung làm việc một slash mở menu.

### Thêm

- Một slash command (mặc định `/menu`) mở menu gốc `@Menu(id, { root: true })`.
- Decorator chuẩn TC39 (không cần `experimentalDecorators` hay `reflect-metadata`): `@Service`, `@Inject`, `@Menu`, `@Button`, `@Select`, `@Modal`.
- DI container singleton, nạp lười, inject theo field.
- Tự quét thư mục: import mọi `*.menu.ts` và `*.service.ts`.
- Router cho button, select, modal; `Nav.stay / to / back / close / modal`.
- Session (stack điều hướng và `ctx.state`) với `MemorySessionStore` và port `SessionStore`.
- Chỉ chủ menu mới bấm được menu của mình.
- Middleware (`(ctx, info, next)`), `UserError` và cooldown theo handler (`cooldownMs`).
- `MenuContext`: helper `button`, `row`, `select`, `modal`, `cid`, `field`, `values`.
- Ví dụ `example/` (menu `home`, `shop`) và test cho `customId` và `Router`.
