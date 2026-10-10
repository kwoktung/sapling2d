# Agent guide for this game

This is a [sapling2d](../../packages/engine/llms.txt) game. **Read `node_modules/sapling2d/llms.txt` (or `packages/engine/llms.txt` in the sapling2d repo) before changing code.**

## Layout

英雄守卫 (Hero Guard): a portrait (750×1334) roguelite tower defense. Three unique heroes (archer / mage / knight) stand on six slots and attack automatically while enemies walk down random curves; XP level-ups offer one of three skill-tree nodes. Spec, numbers and tickets: `.scratch/hero-guard/` at the repo root. The gray-box prototype it grew from is `examples/towerdefense`.

- `src/game.ts` — `gameOptions` (entry scene `Battle`, action `confirm` to restart after a win or loss).
- `src/config.ts` — field, slots, path shape, enemy feel, z layers. Hero / enemy / wave numbers live in `src/data/`.
- `src/data/heroes.ts` — hero base stats and the body/weapon rig (weapon offset, windup and recover times). `src/data/enemies.ts` — enemy stats and per-wave HP growth. `src/data/waves.ts` — the wave table (groups of `{ kind, count, interval, delay }`).
- `src/data/skills.ts` — the skill tree as pure data: `BRANCHES` (hero × branch × 4 levels; level 4 is the evolution), each node's `apply(mods)` edits that hero's per-run mods (`ArcherMods`: arrows, damage / crit / range multipliers, poison, pierce, headshot, poison cloud; `MageMods`: damage, blast radius, burning ground, slow, freeze, chain lightning; `KnightMods`: damage, knockback, collide, arc, range, interval, whirl, stun, taunt); `availableNodes` (next level of each branch of placed heroes), `drawOffers`, `xpToNext`.
- `src/path.ts` — `randomPath` (random control points joined with `Curve2D.catmullRom`) and `linePath` for tests.
- `src/assets.ts` — every texture. Placeholders come from `scripts/gen-placeholders.mjs` until real art replaces them.
- `art/` + `scripts/art/` — the art pipeline (`pnpm art`, see `scripts/art/README.md`): `art/assets.ts` lists every asset (prompt, mode, refs, background, display height, atlas, pivot), `art/style.md` is the shared style prompt. Gemini generates into `art/raw/` (gitignored), `key.ts` chroma-keys the background and its shadows, sprites are resized to 2× display height into `art/sprites/` (committed), then packed into `public/assets/<atlas>.png/.json` for `atlas()`. Generation needs `GEMINI_API_KEY`.
- `src/scenes/Battle.ts` — the whole fight: hero choosing and placing (`openHeroPicker` → `choose` → tap an empty slot; again before waves 3 and 6, from the remaining heroes; `IMPLEMENTED` lists the heroes that can be picked), waves (`startWave`, spawners, gap between waves), leaks and lives, win / loss, hero placement and drag-to-swap between slots, `findTarget` / `findTargets` (in range, least remaining path), arrows (homing or piercing), `damage(e, amount, { crit, dot, ignoreArmor })`, status effects ticked here every frame (poison, slow, freeze, stun, taunt, burning ground; tint priority frozen > stun > taunt > slow > poison; `controllable()` is where immunity goes), the knight's `slash` (cone or 360°, knockback via `Enemy.pushBack`, stun roll, collide) and `tauntAura`, XP and levels (`gainXp` → `openPicker` pauses the tree → `applySkill`), particles, damage numbers, screen shake.
- `src/nodes/Hero.ts` — abstract `Hero` (body + weapon sprites; the attack is a tween: squash windup → `release()` → stretch → settle; the whole node flips with `scale.x` to face the target) `Archer`, `Mage` and `Knight`. `weaponAngle()` / `weaponPose()` shape each weapon's motion (the knight swings: raised back → swung through). `Hero.stats` is recomputed from the base stats and the hero's mods by `refreshStats()`. `Archer.release` builds a `Shot` per arrow (crit roll, every 5th a headshot, poison, pierce); `Mage.release` casts a fireball with a `Blast` payload and every Nth cast a chain lightning.
- `src/nodes/Enemy.ts` — follows its `Curve2D` (`dist`, `remaining`), hops and squashes while walking, `flash` on hit, overhead HP bar, `zIndex = y`.
- `src/nodes/Arrow.ts`, `src/nodes/FloatText.ts` — pooled arrows (a `Shot` payload; piercing arrows fly straight and report every enemy they touch once) and damage numbers. `src/nodes/UpgradePicker.ts` — the level-up cards (`processMode: 'always'` so it works while the tree is paused). `src/nodes/HeroPicker.ts` — the hero cards. `src/nodes/Effects.ts` — `Fireball` (pooled), `BurnZone`, `Bolt` (a lightning segment made of stretched additive glow sprites). `src/nodes/PathPreview.ts` — dotted route preview that fades out. `src/nodes/Slot.ts`, `src/nodes/Hud.ts`.
- `test/art.test.ts` — chroma key on a synthetic image (background, its shadow, enclosed background, anti-aliased edges) and the packed atlas read back by `atlas()`.
- `test/knight.test.ts` — cone and whirl hits, knockback and collide, stun and taunt.
- `test/mage.test.ts` — choosing / placing heroes, unlocks before waves 3 and 6, and every mage branch.
- `test/skills.test.ts` — level-ups (pause, offers, consecutive levels, maxed branches) and every archer node's effect.
- `test/battle.test.ts` — paths and preview, drag / swap / snap back, no attacks while dragging, targeting, hit timing, kills and XP, waves, losing and restarting, winning after 20 waves.

**Hero origins are at the feet**: the body sprite is moved up by half its height, so `hero.position` is the slot center and range checks measure from the feet.

**Tests call `battle.startWith(kind, slot)`** to skip the hero picker, then `battle.stopSpawning()` to place their own enemies (it also stops waves from advancing).

## Workflow

Same as the other examples: test first with `createTestGame`, `pnpm check`, `pnpm dev` for the browser (drag heroes with the mouse), `pnpm build:wechat` for the WeChat Mini Game (logs `[perf] …` every 5 s — build with `SAPLING_LOG_URL` and run `pnpm log-server` to read them).
