# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

discord-menu-kit is a small discord.js v14 framework (TypeScript strict, ESM, Node ≥22, pnpm): one slash command opens a menu, and every button/select/modal in it is routed to decorator-declared handlers with Spring-style DI. The framework lives in `src/framework/` (`core/` DI + decorators, `menu/` BaseMenu/context/Nav/paginate, `routing/` router + customId + guard, `middleware/`, `session/`, `bootstrap/` startApp + scan; `index.ts` is the public API); `example/` is a runnable bot built on it. Docs and user-facing strings are Vietnamese. See `docs/huong-dan-su-dung.md` for the full user guide.

## Commands

```bash
pnpm install
pnpm dev                                     # tsx example/main.ts --hot (menu/command hot reload; needs .env from .env.example)
pnpm menu-kit new <dir>                      # scaffold a project (copies src/framework into it)
pnpm menu-kit generate menu|service|command <name> [--dir src]
pnpm typecheck                               # tsc --noEmit
pnpm test                                    # vitest run
pnpm vitest run tests/router-safety.test.ts  # single file
pnpm vitest run -t "double"                  # single test by name
```

No linter is configured. `pnpm` prints `ERR_PNPM_IGNORED_BUILDS` for esbuild before scripts; it is harmless (`pnpm approve-builds` silences it).

## Architecture

**Self-registering decorators.** `@Menu`, `@Service`, `@Command` push into module-level arrays (`menuRegistry`, `serviceRegistry` in `core/decorators.ts`; `commandRegistry` in `command/command.ts`) when their module is imported. `bootstrap/scan.ts` only imports files named `*.menu.ts` / `*.service.ts` / `*.command.ts`, so a class in a differently named file is silently never registered. `@Service` also publishes `@OnStart/@OnStop/@Scheduled` methods (`core/lifecycle.ts`, run by `bootstrap/app.ts` and `bootstrap/scheduler.ts`). Handler decorators (`@Button/@Select/@Modal`) store `HandlerDef`s in `context.metadata` (standard TC39 decorators, no `experimentalDecorators`, no `reflect-metadata`); `@Menu` reads them back when the class decorator runs.

**DI.** `core/container.ts` is a global lazy-singleton container keyed by class. `@Inject(X)` is a *field* decorator whose initializer calls `container.get(X)`; beans are always built with a no-arg `new`, so there is no constructor injection. `startApp` instantiates every `@Service` at boot to fail fast.

**Interaction flow.** `/menu` → `Router.open` creates a `Session` and renders the root menu. Button/select/modal → `Router.handle` (`routing/router.ts`), which runs everything inside `runWithRequest` (requestId in `AsyncLocalStorage`, `logging/logger.ts`) and logs one `interaction handled` line with `outcome` + `durationMs`:
1. decode customId `km:<sessionId>:<menuId>:<action>:<args…>` (`routing/custom-id.ts`; ≤100 chars, no `:` in any part, so long state goes in `ctx.state`)
2. `InteractionGuard.claim(interaction.id)` drops redeliveries; `exclusive(sessionId)` serializes handlers per session and just `deferUpdate()`s extra clicks
3. load session; missing → `expiry.ts` grays out the stale message and replies with a "reopen" button (customId `km:-:~:open`, handled before any session lookup); wrong owner → same reply without touching their menu
4. reserved actions are handled by the router, with no menu handler: `~page` (`menu/paginate.ts`), `~wiz` (`WizardMenu`, via `routing/builtin-actions.ts`), and the built-in `~confirm` menu pushed by `Nav.confirm` (its `yes` re-runs the original `@Button(onYes)` through `HandlerRunner`)
5. `HandlerRunner` (`routing/handler-runner.ts`): `slow` handlers are `deferUpdate()`d first, `autoDefer` defers after N ms, then middleware chain (`permissionMiddleware` → `cooldownMiddleware` → user middleware) → modal `schema` parse (zod) → handler method
6. returned `Nav` → `Navigator.apply` (push/pop session stack, re-render via `Presenter.renderTop`, save session, `Presenter.update` uses `editReply` after a defer, `update` otherwise)

`render` runs after every handler and may mutate `ctx.state` (paginate clamps the stored page there), so the session is saved after rendering, not before. `Presenter.renderTop` runs `normalizeView` (`menu/view.ts`): it flags Components V2 views and enforces the 40-component / 5-row limits. A session must stay all-classic or all-V2 (Discord cannot switch a message's type); `session.state['~v2']` lets built-in screens match.

**Ports.** `SessionStore` (memory impl only) and `InteractionGuard` are single-process; anything multi-process needs a shared implementation passed through `startApp({ sessions, guard })`.

## Conventions and gotchas

- Relative imports use `.js` extensions (NodeNext); `verbatimModuleSyntax` is on, so use `import type` for types. File names are kebab-case.
- Handler constraints enforced at runtime: `Nav.modal` throws if the interaction is already acknowledged (so never return it from a `slow` / auto-deferred handler) or comes from a modal submit; duplicate menu ids / duplicate (kind, id) handlers throw at import time; menu ids may not contain `:` or start with `~` (reserved for `~confirm` etc.); exactly one `{ root: true }` menu is required by `Router`.
- `startApp` returns `App { client, stop() }` (not the `Client`). Hot reload (`hotReload: true`) re-imports only `*.menu.ts`/`*.command.ts` with a `?v=` cache-bust query and swaps the `Router`; services and shared helper modules stay cached by design.
- Under `tsx`, a script outside a `"type": "module"` package is loaded as CJS and gets a second copy of the framework (empty registries); scratch checks need a `package.json` with `"type": "module"` next to them.
- Vitest 5's default oxc transform cannot lower standard decorators. `vitest.config.ts` swaps in an esbuild plugin, so keep it, and don't add `experimentalDecorators` to tsconfig.
- Logging is silent in tests (`LOG_LEVEL=silent` in `vitest.config.ts`); tests that assert on logs install their own logger with `setLogger(createLogger(..., stream))`.
- Tests use `tests/helpers/fake-interaction.ts` (`fakeClick`, with `message` / `modal` options) instead of discord.js. `menuRegistry` is global per test file and each file needs exactly one root menu. The fakes do not model Discord's 3-second ack deadline, so `slow` behavior needs manual verification against real Discord.
- Releases: update `package.json` `version` *before* tagging (`vX.Y.Z` annotated tags), and add a `CHANGELOG.md` entry. An earlier tag was created while `package.json` still said `1.0.0` and had to be redone.
