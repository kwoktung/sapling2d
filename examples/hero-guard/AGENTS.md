# Agent guide for this game

This is a [sapling2d](../../packages/engine/llms.txt) game. **Read `node_modules/sapling2d/llms.txt` (or `packages/engine/llms.txt` in the sapling2d repo) before changing code.**

## Layout

英雄守卫 (Hero Guard): a portrait (750×1334) roguelite tower defense. Three unique heroes (archer / mage / knight) stand on six slots and attack automatically while enemies walk down random curves; XP level-ups offer one of three skill-tree nodes. Spec, numbers and tickets: `.scratch/hero-guard/` at the repo root. The gray-box prototype it grew from is `examples/towerdefense`.

- `src/game.ts` — `gameOptions` (entry scene `Battle`, action `confirm` to restart after a win or loss).
- `src/config.ts` — field, slots, path shape, enemy feel, z layers. Hero / enemy / wave numbers live in `src/data/`.
- `src/data/heroes.ts` — hero base stats and the body/weapon rig (weapon offset, windup and recover times). `src/data/enemies.ts` — enemy stats and per-wave HP growth. `src/data/waves.ts` — the wave table (groups of `{ kind, count, interval, delay }`).
- `src/path.ts` — `randomPath` (random control points joined with `Curve2D.catmullRom`) and `linePath` for tests.
- `src/assets.ts` — every texture. Placeholders come from `scripts/gen-placeholders.mjs` until the art pipeline (`scripts/art/`, ticket 02) replaces them.
- `src/scenes/Battle.ts` — the whole fight: waves (`startWave`, spawners, gap between waves), leaks and lives, win / loss, hero placement and drag-to-swap between slots, `findTarget` (in range, least remaining path), arrows, damage, XP and kills, particles, damage numbers, screen shake.
- `src/nodes/Hero.ts` — abstract `Hero` (body + weapon sprites; the attack is a tween: squash windup → `release()` → stretch → settle; the whole node flips with `scale.x` to face the target) and `Archer`. `Hero.stats` is a per-run copy of the base stats that the skill tree will modify.
- `src/nodes/Enemy.ts` — follows its `Curve2D` (`dist`, `remaining`), hops and squashes while walking, `flash` on hit, overhead HP bar, `zIndex = y`.
- `src/nodes/Arrow.ts`, `src/nodes/FloatText.ts` — pooled arrows and damage numbers. `src/nodes/PathPreview.ts` — dotted route preview that fades out. `src/nodes/Slot.ts`, `src/nodes/Hud.ts`.
- `test/battle.test.ts` — paths and preview, drag / swap / snap back, no attacks while dragging, targeting, hit timing, kills and XP, waves, losing and restarting, winning after 20 waves.

**Hero origins are at the feet**: the body sprite is moved up by half its height, so `hero.position` is the slot center and range checks measure from the feet.

**Tests call `battle.stopSpawning()`** to place their own enemies; it also stops waves from advancing.

## Workflow

Same as the other examples: test first with `createTestGame`, `pnpm check`, `pnpm dev` for the browser (drag heroes with the mouse), `pnpm build:wechat` for the WeChat Mini Game (logs `[perf] …` every 5 s — build with `SAPLING_LOG_URL` and run `pnpm log-server` to read them).
