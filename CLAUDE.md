# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

discord-menu-kit is a small discord.js v14 framework (TypeScript strict, ESM, Node ≥22, pnpm): one slash command opens a menu, and every button/select/modal in it is routed to decorator-declared handlers with Spring-style DI. The framework lives in `src/framework/`; `example/` is a runnable bot built on it. Docs and user-facing strings are Vietnamese. See `docs/huong-dan-su-dung.md` for the full user guide.

## Commands

```bash
pnpm install
pnpm dev                                     # tsx watch example/main.ts (needs .env from .env.example)
pnpm typecheck                               # tsc --noEmit
pnpm test                                    # vitest run
pnpm vitest run tests/router-safety.test.ts  # single file
pnpm vitest run -t "double"                  # single test by name
```

No linter is configured. `pnpm` prints `ERR_PNPM_IGNORED_BUILDS` for esbuild before scripts; it is harmless (`pnpm approve-builds` silences it).

## Architecture

**Self-registering decorators.** `@Menu`, `@Service` push into module-level arrays (`menuRegistry`, `serviceRegistry` in `decorators.ts`) when their module is imported. `scan.ts` only imports files named `*.menu.ts` / `*.service.ts`, so a menu in a differently named file is silently never registered. Handler decorators (`@Button/@Select/@Modal`) store `HandlerDef`s in `context.metadata` (standard TC39 decorators, no `experimentalDecorators`, no `reflect-metadata`); `@Menu` reads them back when the class decorator runs.

**DI.** `container.ts` is a global lazy-singleton container keyed by class. `@Inject(X)` is a *field* decorator whose initializer calls `container.get(X)`; beans are always built with a no-arg `new`, so there is no constructor injection. `startApp` instantiates every `@Service` at boot to fail fast.

**Interaction flow (`router.ts`).** `/menu` → `Router.open` creates a `Session` and renders the root menu. Button/select/modal → `Router.handle`:
1. decode customId `km:<sessionId>:<menuId>:<action>:<args…>` (`custom-id.ts`; ≤100 chars, no `:` in any part, so long state goes in `ctx.state`)
2. `InteractionGuard.claim(interaction.id)` drops redeliveries; `exclusive(sessionId)` serializes handlers per session and just `deferUpdate()`s extra clicks
3. load session, check owner
4. built-in `~page` action (pagination) is handled here, with no menu handler involved
5. `slow: true` handlers are `deferUpdate()`d first; later output must use `editReply` (handled by `Router.update`)
6. middleware chain (`permissionMiddleware` → `cooldownMiddleware` → user middleware) → handler method → returned `Nav` → `apply` (push/pop session stack, re-render top menu, save session, update message)

`render` runs after every handler and may mutate `ctx.state` (paginate clamps the stored page there), so the session is saved after rendering, not before.

**Ports.** `SessionStore` (memory impl only) and `InteractionGuard` are single-process; anything multi-process needs a shared implementation passed through `startApp({ sessions, guard })`.

## Conventions and gotchas

- Relative imports use `.js` extensions (NodeNext); `verbatimModuleSyntax` is on, so use `import type` for types. File names are kebab-case.
- Handler constraints enforced at runtime: `Nav.modal` throws if the interaction is already acknowledged (so never return it from a `slow` handler) or comes from a modal submit; duplicate menu ids / duplicate (kind, id) handlers throw at import time; exactly one `{ root: true }` menu is required by `Router`.
- Vitest 5's default oxc transform cannot lower standard decorators. `vitest.config.ts` swaps in an esbuild plugin, so keep it, and don't add `experimentalDecorators` to tsconfig.
- Tests use `tests/helpers/fake-interaction.ts` (`fakeClick`) instead of discord.js. `menuRegistry` is global per test file and each file needs exactly one root menu. The fakes do not model Discord's 3-second ack deadline, so `slow` behavior needs manual verification against real Discord.
- Releases: update `package.json` `version` *before* tagging (`vX.Y.Z` annotated tags), and add a `CHANGELOG.md` entry. An earlier tag was created while `package.json` still said `1.0.0` and had to be redone.
