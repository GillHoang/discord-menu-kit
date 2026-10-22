# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), version theo [SemVer](https://semver.org/lang/vi/).
Khi còn `0.x`, API có thể thay đổi giữa các bản minor.

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
