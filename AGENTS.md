## Development

- **Start with `packages/engine/llms.txt`**: the engine API, runnable examples and pitfalls in one file (generated from `docs/llms.template.md` + `docs/examples/*.test.ts` by `pnpm --filter sapling2d docs`; a test fails if it is stale). New games start from `templates/game` (its `AGENTS.md` is the per-game guide).

- `pnpm install`, then `pnpm check` runs typecheck and tests for every workspace package.
- Engine source lives in `packages/engine` (published as `sapling2d`, with `sapling2d/testing` for headless tests).
- `spikes/` holds throwaway experiments and is not part of the workspace.
- Examples live in `examples/*` (`pnpm --filter example-sprite dev`). Game assets go in `public/assets/`; the `sapling2d/vite` plugin fails the build if a `tex()` / `sfx()` / `music()` path doesn't exist.

## WeChat Mini Game

- Build with `saplingWechat({ entry })` from `sapling2d/vite` in a separate Vite config (see `examples/wechat-tree`): `pnpm dev:wechat` (watch) writes `dist-wechat/`; open that folder in WeChat DevTools (it recompiles on change). The CLI is `/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project <dist-wechat>` once the IDE service port is enabled.
- Set `WX_APPID` (mini games reject `touristappid`; use a test account). Dev builds inline sourcemaps and exceed 4 MB, so they only run in the simulator; real-device preview needs `SAPLING_RELEASE=1`.
- To read device logs from the terminal: run `pnpm log-server` and build with `SAPLING_LOG_URL=http://<LAN IP>:7777/log`; console output and uncaught errors are forwarded (the phone must have 开发调试 enabled).
- The simulator differs from devices (globals, timer units, WebGL quirks); see `spikes/wechat/REPORT.md` before trusting simulator-only results.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
