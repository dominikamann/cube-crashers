# Cube Crashers – Phase 1 (Single Player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable single-player version of Cube Crashers – a voxel lane/horde shooter with auto-firing weapons, tower build pads, 10 waves and the Segment Worm boss – as a Windows/macOS desktop app.

**Architecture:** A pure, deterministic simulation (`src/sim/`, no Three.js/DOM imports, fixed 60 Hz tick, commands in → state + events out) is driven by a thin client: Three.js renderer, Web-Audio synth, DOM UI and keyboard input all *read* sim state and *consume* sim events. This split is what makes Phase 2 (host-authoritative LAN) possible without rewriting game logic. Electron wraps the Vite build.

**Tech Stack:** TypeScript 5 (strict), Vite 5, Three.js 0.160.x, Vitest, Electron 33 + electron-builder, Web Audio API (no audio files).

**Spec:** `docs/superpowers/specs/2026-11-11-cube-crashers-design.md` (German). Read it before any task. Look reference: `docs/design/style-reference.html`.

## Global Constraints

- Repo root is `cube-crashers/`. Everything lives there. MIT license. No asset or dependency without a free license; no protected names/characters (no Pac-Man, Space Invaders, Smarties, etc.).
- All player-visible text in English, only via `t('key')` from `src/i18n/` (German comes later as a second file).
- `src/sim/**` must not import `three`, DOM, `window`, `Math.random` or `Date`. Randomness only via the seeded `Rng` in state.
- Sim tick: `TICK_RATE = 60`, `DT = 1/60`. Client runs a fixed-step accumulator, max 5 sim steps per frame.
- Look A1 (day) default; A2 (night) on boss entry. Bloom (Three.js `UnrealBloomPass`): day strength 0.25 / radius 0.15 / threshold 0.95; night 0.45 / 0.15 / 0.6. Render target with `samples: 4`. Night background `0x1a1840`, never black. Readability beats effects – never let effects blur gameplay.
- Building never pauses the game.
- Numbers pinned by the spec: 10 waves; mini-boss in wave 5; Segment Worm in wave 10; ~5 s pause between waves; boss phases at 66 % and 33 % HP; worm split only if resulting worms have ≥ 3 segments, max 4 worms alive; max 6 weapons held, max weapon level 5; 6–8 build pads; 3 tower kinds; 4 enemy kinds; stars 1–3 after a win.
- Builder decisions in this plan (adjustable during balancing): base HP 20; player HP 100; respawn after 3 s, losing 25 % of coins; stars: 3 if base HP ≥ 80 %, 2 if ≥ 40 %, else 1.
- Commit messages: plain conventional commits, no tool/AI attribution lines.

## Review Focus

1. **Window loses focus / laptop sleeps** → a huge frame delta must not fast-forward or explode the sim; the game auto-pauses on `blur`/`visibilitychange` and the accumulator is capped. Test in Task 10.
2. **Build attempt with too few coins or on an occupied pad** → nothing is built, coins unchanged, a `buildDenied` event fires (sound + UI shake). Test in Task 5.
3. **Hundreds of hits/coins in one second** → audio must not clip or stack into noise: max 4 concurrent voices per sound id, master limiter. Test in Task 9.
4. **Picking up a weapon crate when already holding 6 weapons at max level** → never lost or crashing: if 6 held, crate upgrades the lowest-level held weapon; if all are level 5, it pays 25 coins. Test in Task 4.
5. **Boss dies while the last worm split happens in the same tick / several worms die together** → game is won exactly once (`gameWon` emitted once, phase stays `won`). Test in Task 7.

---

## File Structure

```
cube-crashers/
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts
  electron-builder.yml, .gitignore, LICENSE, README.md, index.html
  electron/main.cjs                 Electron main process (window, prod/dev loading)
  src/
    main.ts                         boot: wire sim + render + audio + ui + input, game loop
    loop.ts                         fixed-step accumulator (pure, testable)
    i18n/index.ts, i18n/en.ts       t(key, params?) + English strings
    sim/
      types.ts                      all sim types, events, commands
      rng.ts                        seeded mulberry32
      sim.ts                        createSim, stepSim (orders the systems)
      config/enemies.ts, weapons.ts, towers.ts, waves.ts, map01.ts
      systems/player.ts, enemies.ts, waves.ts, combat.ts, weapons.ts,
              coins.ts, crates.ts, towers.ts, boss-worm.ts, miniboss.ts, outcome.ts
      util.ts                       distance, nearest-target helpers
    render/
      renderer.ts                   WebGLRenderer + composer + resize
      theme.ts                      A1/A2 palettes + bloom params + blend(t)
      world.ts                      voxel ground, lane edges, pads, base arcade cabinet
      entities.ts                   InstancedMesh pools for enemies/projectiles/coins/crates
      actors.ts                     player, towers, worm segments
      fx.ts                         cube-burst particles, telegraph rings, screen shake
    audio/
      synth.ts                      sfxr-style param → sound
      sfx.ts                        sound library (ids → params) + event→sound mapping
      mixer.ts                      master limiter, music/sfx buses, voice limiting
      music.ts                      chiptune step sequencer + 3 tracks
    input/keyboard.ts               key state → Command[]
    ui/hud.ts, build-menu.ts, screens.ts, ui.css
  tests/ (mirrors src: tests/sim/*.test.ts, tests/audio/*.test.ts, tests/loop.test.ts, tests/i18n.test.ts)
```

Coordinate system (sim is 2D on the ground plane): `x` across the lane, `z` along it. Lane `x ∈ [-4.5, 4.5]`. Enemies spawn at `z ≈ -30` and walk toward `+z`. Base line at `z = 8`. Player area `x ∈ [-6, 6]`, `z ∈ [-6, 7]`. Render maps sim `(x, z)` → Three.js `(x, y, z)`.

---

### Task 1: Project scaffold, i18n, license, README

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `LICENSE`, `README.md`, `src/main.ts` (placeholder that renders `t('title')`), `src/i18n/index.ts`, `src/i18n/en.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Produces: `t(key: StringKey, params?: Record<string, string | number>): string`; `type StringKey = keyof typeof en`. Placeholders use `{name}`.
- npm scripts: `dev` (vite), `build` (tsc --noEmit && vite build), `test` (vitest run), `app` (electron, added in Task 11).

- [ ] **Step 1:** `git init` in `cube-crashers/`. `.gitignore`: `node_modules/ dist/ release/ .DS_Store`. LICENSE: MIT, `Copyright (c) 2026 Dominik Amann`. README: name, one-paragraph pitch, "Play / Develop / Build" sections (commands filled as tasks land), "Contributing: assets must be original or freely licensed".
- [ ] **Step 2:** Install: `npm i three@0.160.1` and `npm i -D typescript vite vitest @types/three`. `tsconfig`: strict, `moduleResolution: bundler`, target ES2022. Vite `base: './'` (needed for Electron file loading).
- [ ] **Step 3: Write failing test** `tests/i18n.test.ts`:
```ts
expect(t('title')).toBe('Cube Crashers');
expect(t('hud.wave', { n: 3, total: 10 })).toBe('Wave 3/10');
```
- [ ] **Step 4:** Run `npm test` → FAIL (module missing).
- [ ] **Step 5:** Implement `en.ts` (start with `title`, `hud.wave: 'Wave {n}/{total}'`; later tasks add keys) and `t()`.
- [ ] **Step 6:** `npm test` → PASS; `npm run build` → succeeds; `npm run dev` shows "Cube Crashers".
- [ ] **Step 7: Commit** `chore: scaffold Cube Crashers project`

### Task 2: Sim core – types, RNG, player movement

**Files:**
- Create: `src/sim/types.ts`, `src/sim/rng.ts`, `src/sim/sim.ts`, `src/sim/util.ts`, `src/sim/systems/player.ts`, `src/sim/config/map01.ts`
- Test: `tests/sim/core.test.ts`

**Interfaces (Produces – later tasks extend these types, never rename):**
```ts
export const TICK_RATE = 60; export const DT = 1 / TICK_RATE;
export type Vec2 = { x: number; z: number };
export type EnemyKind = 'blob' | 'dasher' | 'tank' | 'splitter' | 'splitling' | 'miniboss';
export type WeaponKind = 'pixelBlaster' | 'laserSword' | 'candyCannon' | 'hotdogSlinger' | 'joystickBoomerang' | 'discoBall';
export type TowerKind = 'laser' | 'popcorn' | 'frost';
export type Command =
  | { type: 'move'; playerId: number; dir: Vec2 }            // length 0..1
  | { type: 'build'; playerId: number; padId: number; tower: TowerKind };
export interface MapDef { id: string; pads: { id: number; pos: Vec2 }[]; playerSpawn: Vec2; laneHalfWidth: 4.5; spawnZ: -30; baseZ: 8 }
export interface Player { id: number; pos: Vec2; hp: number; maxHp: number; coins: number; downUntil: number | null; weapons: HeldWeapon[]; coinStreak: number; lastCoinTick: number }
export interface HeldWeapon { kind: WeaponKind; level: number; cooldown: number }
export type SimEvent = /* discriminated union on `type`, extended per task; see list below */;
export interface SimState { tick: number; rng: Rng; map: MapDef; players: Player[]; enemies: Enemy[]; projectiles: Projectile[]; coins: Coin[]; crates: Crate[]; towers: Tower[]; base: { hp: number; maxHp: number }; wave: WaveState; boss: BossState | null; phase: 'playing' | 'won' | 'lost'; look: 'day' | 'night'; nextId: number; events: SimEvent[] }
export function createSim(map: MapDef, seed: number): SimState;   // 1 player id 0, Pixel Blaster lvl 1, 0 coins
export function stepSim(s: SimState, commands: Command[]): void;  // clears s.events, applies commands, runs systems, tick++
export class Rng { constructor(seed: number); next(): number /* [0,1) */; range(a: number, b: number): number; pick<T>(arr: T[]): T }
export function updatePlayers(s: SimState, moves: Map<number, Vec2>): void;  // PLAYER_SPEED = 6 units/s, clamp to player area
```
Full event list (each task adds its own; names fixed here): `shot, enemyHit, enemyKilled, coinPicked, crateOpened, towerBuilt, buildDenied, towerFired, baseHit, playerHit, playerDown, playerRespawn, waveStart, waveCleared, bossSpawn, bossPhase, bossTelegraph, bossImpact, wormSplit, bossDead, gameWon, gameLost`.
Define `Enemy`, `Projectile`, `Coin`, `Crate`, `Tower`, `WaveState`, `BossState` as minimal placeholder interfaces here (`{ id: number; pos: Vec2 }` + fields added by their tasks).

`map01.ts`: 7 pads – `(-5.6,-14) (5.6,-14) (-5.6,-6) (5.6,-6) (-5.6,1) (5.6,1) (0,-20)` (the last is the risky forward pad in the lane middle), player spawn `(0, 5)`.

- [ ] **Step 1: Failing tests:**
  - same seed → `new Rng(42)` produces identical first 5 numbers twice; different seeds differ.
  - `move` dir `(1,0)` for 60 ticks moves player `x` by 6 (±0.001).
  - moving right for 10 s clamps at `x = 6`.
  - `stepSim` increments `tick` and empties `events` from the previous tick.
- [ ] **Step 2:** `npx vitest run tests/sim/core.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `stepSim` system order (later tasks insert theirs at these slots): commands → players → waves → enemies → boss → weapons/combat → towers → coins → crates → outcome.
- [ ] **Step 4:** Tests PASS. Add a lint-style test that greps `src/sim/**` for `from 'three'`, `Math.random`, `Date.`, `window`, `document` and fails on any match.
- [ ] **Step 5: Commit** `feat(sim): core state, seeded rng, player movement`

### Task 3: Enemies, waves, base, losing

**Files:**
- Create: `src/sim/config/enemies.ts`, `src/sim/config/waves.ts`, `src/sim/systems/enemies.ts`, `src/sim/systems/waves.ts`, `src/sim/systems/outcome.ts`
- Test: `tests/sim/waves.test.ts`

**Interfaces:**
- Produces: `Enemy { id; kind: EnemyKind; pos; hp; maxHp; speed; slowUntil: number; radius }`; `ENEMIES: Record<EnemyKind, { hp; speed; radius; coins; contactDamage; baseDamage }>`; `WAVES: WaveDef[]` with `WaveDef { groups: { kind: EnemyKind; count: number; interval: number /*s*/ }[]; boss?: 'miniboss' | 'worm'; crates: number }`; `WaveState { index: number /*0-based*/; spawnQueue: {kind; at: number /*tick*/}[]; pauseUntil: number | null }`; `spawnEnemy(s, kind, pos): Enemy`; `damageBase(s, amount)`.
- Enemy values (starting balance): blob hp 10 speed 1.8 coins 1; dasher hp 5 speed 3.6 coins 1; tank hp 60 speed 0.9 coins 5; splitter hp 20 speed 1.6 coins 2 → on death 2 splitlings (hp 6, speed 2.4, coins 0); baseDamage 1 (tank 3).
- Waves: 10 entries, escalating; wave 5 `boss: 'miniboss'`, wave 10 `boss: 'worm'`. Waves 1–2 blobs only, dashers from 3, tanks from 4, splitters from 6. Spawn x uniformly within lane.
- Wave end = queue empty and no enemies (and boss dead if any) → `waveCleared`, pause `5 * TICK_RATE` ticks → next `waveStart`. Base HP 20; enemy reaching `z ≥ baseZ` is removed, `baseHit`, base hp −baseDamage; hp ≤ 0 → phase `lost`, `gameLost` once.

- [ ] **Step 1: Failing tests:** wave 1 starts at tick 0 with `waveStart {wave: 1}`; an enemy walking unopposed reaches the base and reduces base hp by 1 with `baseHit`; 20 leaks → `phase === 'lost'`, `gameLost` emitted exactly once, further steps don't change state; a cleared wave emits `waveCleared` then `waveStart {wave: 2}` exactly 300 ticks later; after `phase !== 'playing'` `stepSim` is a no-op.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(sim): enemies, wave schedule, base and defeat`

### Task 4: Weapons, auto-fire, coins, crates

**Files:**
- Create: `src/sim/config/weapons.ts`, `src/sim/systems/weapons.ts`, `src/sim/systems/combat.ts`, `src/sim/systems/coins.ts`, `src/sim/systems/crates.ts`
- Test: `tests/sim/weapons.test.ts`, `tests/sim/crates.test.ts`

**Interfaces:**
- Produces: `damageEnemy(s, enemy, amount, source: WeaponKind | TowerKind): void` (emits `enemyHit`; on hp ≤ 0 removes, emits `enemyKilled {kind,pos}`, drops `ENEMIES[kind].coins` coins with small scatter; splitter spawns splitlings) – **all damage in the game goes through this function** (towers and boss use it too). `nearestEnemy(s, from: Vec2, range: number): Enemy | null` in `util.ts`.
- `Projectile { id; pos; vel; damage; pierce: number; ttl: number; kind: WeaponKind | TowerKind; areaRadius?: number }`; `Coin { id; pos; value }`; `Crate { id; pos; weapon: WeaponKind; hp }`.
- `WEAPONS: Record<WeaponKind, { cooldown: number /*s*/; range: number; perLevel: ... }>` – behaviours (auto-target nearest enemy in range; worm segments count as enemies, see Task 7):
  - pixelBlaster: straight bolt, dmg 4, cd 0.35 s, +1 bolt per 2 levels.
  - laserSword: 360° swing radius 1.8, dmg 8, cd 0.9 s, radius +0.2/level.
  - candyCannon: 5-ball spread 40°, dmg 2 each, cd 0.8 s, +1 ball/level.
  - hotdogSlinger: lob to target, lands after 0.6 s, mustard puddle r 1.5 for 2 s, 3 dmg/0.25 s.
  - joystickBoomerang: flies 7 units out and back, pierce ∞, dmg 5, cd 1.4 s.
  - discoBall: orbits player r 2, every 0.5 s beams the 2 nearest enemies for 3 dmg (+1 target/level).
  - Each level: +20 % damage unless stated.
- Coins: magnet radius 2.5 pulls at 10 u/s; pickup radius 0.5 → `player.coins += value`, `coinPicked {streak}`; streak increments if previous pickup was ≤ 30 ticks ago, else resets to 1 (drives rising pitch).
- Crates: wave defs say how many; spawn in lane with the wave, move like a blob (speed 1.8), hp 8 (shots open them), or pickup on touch. Opening: `grantWeapon(s, player, kind)` – not held & < 6 held → add at level 1; held → level +1 (max 5); 6 held and kind not held → upgrade lowest-level held weapon; all held at level 5 → +25 coins. Emit `crateOpened {weapon, level}`. Crate weapon chosen by rng from non-max weapons, excluding pixelBlaster. A crate that reaches the base just disappears (no base damage).

- [ ] **Step 1: Failing tests:** a blob placed 3 units in front of the player dies from the Pixel Blaster within 2 s and emits `enemyKilled`; it drops 1 coin which is picked up and `coins === 1`; two pickups 10 ticks apart give streak 2; `grantWeapon` cases: new → level 1; duplicate → level 2; 6 held + new kind → lowest held upgraded and count stays 6; all 6 at level 5 → +25 coins (**Review Focus 4**); laserSword hits all 3 enemies inside radius 1.8 in one swing; splitter death spawns 2 splitlings.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(sim): auto-firing weapons, coins and weapon crates`

### Task 5: Towers and build pads

**Files:**
- Create: `src/sim/config/towers.ts`, `src/sim/systems/towers.ts`
- Test: `tests/sim/towers.test.ts`

**Interfaces:**
- Produces: `Tower { id; kind: TowerKind; padId: number; pos: Vec2; hp: number; maxHp: number; cooldown: number }`; `TOWERS: Record<TowerKind, { cost; hp; range; cooldown; ... }>`; `padAt(s, pos: Vec2): number | null` (player within 1.2 of pad centre); `BUILD_RADIUS = 1.2`.
- Values: laser cost 15, range 7, single target 6 dmg, cd 0.4 s, hp 40. popcorn cost 25, range 9, shell lands after 0.8 s, area r 2, 10 dmg, cd 2 s, hp 40. frost cost 20, range 5, pulse every 1.5 s slows enemies in range to 50 % for 2 s (`slowUntil`), hp 40.
- `build` command valid only if player is alive, standing on that pad (`padAt` matches), pad empty and `coins ≥ cost` → deduct, create tower, `towerBuilt`. Otherwise `buildDenied {padId, reason: 'coins' | 'occupied' | 'notOnPad'}`, no state change. Towers with hp ≤ 0 are removed (pad becomes free). Tower shots use `damageEnemy`.

- [ ] **Step 1: Failing tests:** build with 15 coins on empty pad → tower exists, coins 0, `towerBuilt`; build with 14 coins → `buildDenied reason 'coins'`, coins still 14, no tower; build on occupied pad → `buildDenied 'occupied'` (**Review Focus 2**); build while 3 units from pad → `'notOnPad'`; laser tower kills a blob in range; frost halves enemy speed for 2 s.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): tower build pads and three tower types`

### Task 6: Player damage, down and respawn

**Files:**
- Modify: `src/sim/systems/player.ts`, `src/sim/systems/enemies.ts`
- Test: `tests/sim/player.test.ts`

**Interfaces:**
- Enemy contact (distance < enemy.radius + 0.4): `ENEMIES[kind].contactDamage` per second (blob 10, dasher 8, tank 25, splitter 10, splitling 5). `damagePlayer(s, player, amount)` → `playerHit`; hp ≤ 0 → `downUntil = tick + 3*TICK_RATE`, coins −25 % (floor), `playerDown`. While down: no movement, weapons don't fire, no pickups. At `downUntil`: hp full, pos = spawn, `playerRespawn`. Weapons are kept.

- [ ] **Step 1: Failing tests:** player at 100 hp standing in a tank for 4 s goes down, coins 40 → 30; while down a `move` command doesn't move them and no `shot` events occur; after 180 ticks `playerRespawn`, hp 100, weapons unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): player damage, down state and respawn`

### Task 7: Mini-boss, Segment Worm, winning

**Files:**
- Create: `src/sim/systems/miniboss.ts`, `src/sim/systems/boss-worm.ts`
- Modify: `src/sim/systems/outcome.ts`, `src/sim/systems/waves.ts`
- Test: `tests/sim/boss.test.ts`

**Interfaces:**
- `BossState { kind: 'miniboss' | 'worm'; maxHp: number; phase: 1 | 2 | 3; worms: Worm[]; telegraphs: Telegraph[]; nextAttackAt: number }`; `Worm { id; segments: Segment[]; heading: number }`; `Segment { id; pos; hp; maxHp }`; `Telegraph { id; pos; radius; impactAt: number; damage: number }`.
- Boss HP = sum of segment hp (worm) / miniboss enemy hp. Phase from remaining fraction: > 0.66 → 1, > 0.33 → 2, else 3; each change emits `bossPhase {phase}` once and spawns a reinforcement group (phase 2: 8 blobs; phase 3: 6 dashers + 2 tanks).
- **Telegraphed attacks** (both bosses): `bossTelegraph {pos, radius, delay}` then at `impactAt` `bossImpact`: damages player and towers inside radius (player 30, towers 20). Telegraph delay 1.2 s (phase 3: 0.9 s). Worm targets the player or a random tower 50/50; attack interval 3 s / 2.5 s / 2 s by phase.
- **Mini-boss (wave 5):** enemy kind `miniboss` (oversized tank look): hp 400, speed 0.6, baseDamage 5, uses telegraph slam (r 2.5) every 4 s. Uses phases too.
- **Segment Worm (wave 10):** on spawn `look = 'night'`, `bossSpawn {kind:'worm'}`. 16 segments × 40 hp, spacing 0.9, head moves serpentine (`x = 3.5 * sin(t*1.2)`) toward base at 0.8 u/s; body follows the head's path. Segments are targetable – `nearestEnemy` must consider segments (expose them through a `targets(s)` iterator in `util.ts` used by weapons and towers; `damageEnemy` gets an overload/branch for segments → `damageSegment`).
  - Segment destroyed: if it is head or tail → just removed (next one becomes head/tail). If it is a middle segment and both resulting parts have ≥ 3 segments and fewer than 4 worms are alive → split: back part becomes a new worm with its own head, `wormSplit {pos}`. Otherwise (part < 3 or 4 worms alive) the segment is simply removed and the worm closes the gap.
  - A worm head reaching the base deals 5 base damage per segment and the worm is removed.
- Boss dead (all segments gone / miniboss killed) → `bossDead {pos}`, coin burst (worm: 40 coins), worm: `look = 'day'`. If that was wave 10 → phase `won`, `gameWon {stars}` exactly once; stars per Global Constraints.

- [ ] **Step 1: Failing tests:**
  - destroying segment 8 of a 16-segment worm → 2 worms (7 and 8 segments), `wormSplit` emitted.
  - destroying segment 2 of a 4-segment worm → still 1 worm with 3 segments, no split.
  - with 4 worms alive, a middle kill does not create a 5th worm.
  - dropping total hp below 66 % emits `bossPhase {phase:2}` once and spawns 8 blobs.
  - a telegraph on the player's position deals 30 damage at `impactAt` and none if the player moves out of the radius before.
  - killing the last two segments in the same tick → `gameWon` emitted exactly once; stepping further emits nothing (**Review Focus 5**).
  - stars: base hp 20/20 → 3, 10/20 → 2, 4/20 → 1.
  - worm spawn sets `look = 'night'`, boss death sets `look = 'day'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Also run a headless full-game smoke test: scripted bot that stands still with all 6 weapons at level 5 on seed 1 for up to 20 min sim time must reach `won` (proves the game is completable and the loop terminates).
- [ ] **Step 5: Commit** `feat(sim): mini-boss, splitting Segment Worm, victory and stars`

### Task 8: Renderer – voxel world, A1/A2 looks, entities, effects

**Files:**
- Create: `src/render/renderer.ts`, `theme.ts`, `world.ts`, `entities.ts`, `actors.ts`, `fx.ts`
- Test: `tests/render/theme.test.ts` (pure parts only)

**Interfaces:**
- Consumes: `SimState` (read-only), `SimEvent[]`.
- Produces: `createRenderer(canvas: HTMLCanvasElement, map: MapDef): GameRenderer` with `GameRenderer { render(s: SimState, alpha: number, events: SimEvent[], frameDt: number): void; dispose(): void }`. `THEMES: { day: Theme; night: Theme }`, `blendTheme(a, b, t): Theme` (`Theme { background; fog; hemiSky; hemiGround; hemiIntensity; sunColor; sunIntensity; roadA; roadB; grassA; grassB; bloomStrength; bloomRadius; bloomThreshold }`).
- Visuals follow `docs/design/style-reference.html` (copy palettes and the A1/A2 values from there and from Global Constraints). Look changes blend over 1.5 s.
- Ground: voxel tiles as one `InstancedMesh`. Lane edges thin emissive strips. Pads: glowing cyan platform; pulsing brighter when the player is on it. Base: voxel arcade cabinet at `z = 9` with a screen whose colour drops from green to red with base hp.
- Enemies, projectiles, coins, crates: one `InstancedMesh` per kind (pool size 512, grow ×2 when exceeded). Enemy eyes emissive. Coins: small gold voxel discs with a spinning sparkle. Crates: voxel box with "?" pixel face. Every enemy kind visibly distinct by shape+colour (blob cube, dasher flat & pointy, tank big grey with plates, splitter two-tone that cracks).
- Player: voxel figure with cyan visor (as in reference); each held weapon shows a small visual (sword arc, orbiting disco ball, etc.). Towers: voxel towers per kind with emissive top; laser beam as thin emissive cylinder.
- Worm: each segment a voxel block, head with horns and red emissive eyes, magenta aura ring under the head.
- fx: `enemyKilled` → 12–20 small cubes in the enemy colour fly out, fade in 0.6 s (pooled); `bossDead` → 300 cubes; telegraph → pulsing red ring on ground growing to radius until impact; `baseHit`/`bossImpact` → screen shake (amplitude 0.15/0.4, 0.25 s); damage flash white for 2 frames.
- Camera: perspective FOV 45 at `(playerX * 0.3, 13, playerZ + 9)` looking at `(playerX * 0.3, 0, playerZ - 8)`, smoothed.
- Interpolate positions between previous and current sim state with `alpha`.

- [ ] **Step 1: Failing test:** `blendTheme(day, night, 0)` deep-equals day; at `1` equals night; at `0.5` bloom strength is 0.35.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Visual check:** temporary dev route `?demo=1` spawns wave 4 + the worm with all weapons; screenshot day and night. Must be crisp: edges anti-aliased, enemies distinguishable from ground in both looks, nothing smeared by bloom. 100+ enemies at 60 FPS on the dev Mac (check with Three.js `renderer.info` + frame time overlay in dev only).
- [ ] **Step 6: Commit** `feat(render): voxel world, day/night looks, entities and effects`

### Task 9: Audio – synthesized SFX, chiptune music, mixer

**Files:**
- Create: `src/audio/synth.ts`, `sfx.ts`, `mixer.ts`, `music.ts`
- Test: `tests/audio/mixer.test.ts`, `tests/audio/sfx.test.ts`

**Interfaces:**
- `SynthParams { wave: 'square' | 'saw' | 'triangle' | 'sine' | 'noise'; freq: number; freqEnd?: number; attack: number; sustain: number; decay: number; volume: number; duty?: number; vibrato?: { rate; depth }; lowpass?: number }`; `playSynth(ctx: BaseAudioContext, dest: AudioNode, p: SynthParams, when: number, pitchMul: number): void`. Layered sounds = `SynthParams[]`.
- `SOUNDS: Record<SoundId, SynthParams[]>`; `soundsForEvent(e: SimEvent): { id: SoundId; pitch: number }[]` (pure, testable).
- `Mixer { play(id: SoundId, pitch?: number): void; setMusicVolume(v: number): void; setSfxVolume(v: number): void; readonly musicBus: GainNode }`; `createMixer(ctx: AudioContext): Mixer`. Master chain: sfxBus + musicBus → `DynamicsCompressorNode` (threshold −10 dB, ratio 12, attack 0.003) → destination. `VoiceLimiter` (pure class): `tryStart(id, now): boolean`, max 4 concurrent per id, each voice assumed alive for its sound duration; additionally max 1 start per id per 20 ms.
- Sound design (punchy chiptune, every event satisfying): each weapon its own shot (blaster: short square blip 880→440; laser sword: saw sweep with whoosh noise; candy cannon: 5 quick high triangle "pops"; hotdog: low "thwump" + squelch noise on landing; boomerang: rising/falling vibrato square; disco: shimmering triangle arpeggio); `enemyHit` tiny tick (random pitch ±8 %); `enemyKilled` crunchy noise burst + square drop; `coinPicked` two-note bling, pitch × `1.059^min(streak,12)`; `crateOpened` 4-note fanfare; `towerBuilt` mechanical clunk + rising chime; `buildDenied` low double buzz; tower shots per kind; `baseHit` deep alarm thud; `playerDown` descending sweep; `playerRespawn` rising arpeggio; `waveStart` short jingle; `bossSpawn` siren (two-tone, 3 s); `bossPhase` big hit + siren blip; `bossTelegraph` rising whine of telegraph length; `bossImpact` heavy noise boom; `wormSplit` wet crunch; `bossDead` long explosion + victory sting; `gameWon`/`gameLost` jingles; `uiClick`.
- Music (`music.ts`): 16-step pattern sequencer with look-ahead scheduling (25 ms timer, 100 ms horizon) on `musicBus`; channels: pulse lead, pulse harmony, triangle bass, noise drums. Tracks: `menu` (100 BPM, relaxed), `battle` (140 BPM, driving), `boss` (160 BPM, minor, heavier drums). Original compositions written as note arrays in the file. `playTrack(id)`, crossfade 1 s. Battle → boss on `bossSpawn`, back to battle on `bossDead`.

- [ ] **Step 1: Failing tests:** `VoiceLimiter`: 10 `tryStart('enemyHit', t)` calls at the same time → exactly 1 true (20 ms rule); spaced 30 ms apart over a long sound → max 4 true (**Review Focus 3**); `soundsForEvent({type:'coinPicked', streak: 3})` pitch ≈ `1.059**3`; streak 50 is capped at `1.059**12`; every `SimEvent` type maps to ≥ 1 sound except `waveCleared` (test iterates a fixture of all event types); render a 0.5 s `OfflineAudioContext` with 40 simultaneous `enemyKilled` through the mixer chain → peak sample ≤ 1.0 (if Vitest lacks `OfflineAudioContext`, use the `node-web-audio-api` dev dependency).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Listening check:** dev page `?sound=1` with a button per sound and track. Every sound short, punchy, not shrill; nothing clips with all buttons mashed.
- [ ] **Step 6: Commit** `feat(audio): synthesized sound effects, chiptune music and mixer`

### Task 10: Input, UI and game loop wiring

**Files:**
- Create: `src/loop.ts`, `src/input/keyboard.ts`, `src/ui/hud.ts`, `src/ui/build-menu.ts`, `src/ui/screens.ts`, `src/ui/ui.css`
- Modify: `src/main.ts`, `src/i18n/en.ts`
- Test: `tests/loop.test.ts`, `tests/input.test.ts`

**Interfaces:**
- `createLoop(step: () => void, render: (alpha: number, frameDt: number) => void): { frame(nowMs: number): void; pause(): void; resume(): void; paused: boolean }` – accumulator with `DT`, max 5 steps per frame, drops excess time; while paused, `step` never runs.
- `Keyboard { commands(s: SimState, playerId: number): Command[]; buildMenuOpen: boolean }`: WASD/arrow keys → normalized `move`; hold `E` ≥ 150 ms while `padAt` is non-null → `buildMenuOpen`; while open, `1`/`2`/`3` (or click in menu) → one `build` command for laser/popcorn/frost, closes menu; releasing `E` closes. `Esc`/`P` → pause.
- Main flow (`screens.ts`): Title screen (Play, Settings, Quit) → game → Pause overlay (Resume, Settings, Quit to menu) → Win screen (stars, coins, time) / Lose screen (wave reached) → Play again / Menu. Settings: music volume, SFX volume (persisted in `localStorage`, wrapped in try/catch).
- HUD (DOM overlay, voxel/pixel style font "Press Start 2P" bundled locally – OFL license file added to `LICENSE-ASSETS.md`): top-left base HP bar with arcade cabinet icon; top-centre `Wave n/10` + countdown during pauses; top-right coin counter with pixel coin; bottom: weapon slots (6) with level pips; player HP bar above the player; boss HP bar across the top when a boss is alive with phase markers at 66 %/33 %; build menu as small radial of 3 tower cards with cost, greyed when unaffordable; `buildDenied` shakes the card; "Press E to build" hint near a free pad.
- Auto-pause on `window blur` and `document.visibilitychange` (hidden) → pause overlay.
- `main.ts`: `createSim(map01, seed = Date.now() & 0xffffffff)` (allowed outside `src/sim`), feeds keyboard commands to `stepSim`, collects events per frame for renderer, mixer and HUD. First user click on title screen resumes the `AudioContext`.
- All strings via `t()`.

- [ ] **Step 1: Failing tests:** `createLoop`: frames at 0 ms and 16.67 ms → 1 step; a single frame after a 10 000 ms gap → exactly 5 steps (**Review Focus 1**); paused → 0 steps; keyboard: W+D → `move` dir length 1 (normalized diagonal); E held 200 ms on a pad then `2` → exactly one `build` with tower `popcorn`; E held off-pad → no menu.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Play-through:** `npm run dev`, play a full round: build towers mid-wave without pause, collect crates, reach the worm (night look + boss music), win; lose a round deliberately; alt-tab mid-wave → game pauses. Fix what feels off before committing.
- [ ] **Step 6: Commit** `feat: playable single-player game with HUD, menus and build menu`

### Task 11: Electron desktop app for Windows and macOS

**Files:**
- Create: `electron/main.cjs`, `electron-builder.yml`
- Modify: `package.json`, `README.md`

**Interfaces:**
- `electron/main.cjs`: one `BrowserWindow` 1280×720, min 960×540, `backgroundColor '#9fd8ef'`, no menu bar on Windows, `contextIsolation: true`, `nodeIntegration: false`; loads `process.env.VITE_DEV_SERVER_URL` if set else `dist/index.html`. F11 toggles fullscreen. Single-instance lock. (Phase 2 will add the LAN server to this main process – keep it a plain module, no logic in the renderer that assumes no main process.)
- Scripts: `app:dev` (vite + electron via `concurrently` + `wait-on`), `dist:mac` (`npm run build && electron-builder --mac dmg --arm64 --x64`), `dist:win` (`npm run build && electron-builder --win nsis --x64`). `appId: io.github.cubecrashers`, `productName: Cube Crashers`, unsigned (`mac.identity: null`), output `release/`. Icon: generated 1024 px voxel cube PNG in `build/icon.png` (made in-repo with a small node script or drawn as pixel art – original).
- README: download/run instructions incl. "unsigned build: on macOS right-click → Open once; on Windows click 'More info → Run anyway'"; dev commands; note that signing can be added later (Apple Developer account exists).

- [ ] **Step 1:** `npm i -D electron electron-builder concurrently wait-on`. Implement main process and config.
- [ ] **Step 2:** `npm run app:dev` → game window opens, plays, sound works.
- [ ] **Step 3:** `npm run dist:mac` → `release/*.dmg` exists; install, open via right-click → Open, play a wave.
- [ ] **Step 4:** `npm run dist:win` → `release/*.exe` exists. If cross-building from macOS fails, add `.github/workflows/build.yml` building on `windows-latest` and `macos-latest` on tag push, uploading artifacts; note in README. Test the `.exe` on a Windows machine (manual, report result).
- [ ] **Step 5:** `npm test` and `npm run build` green.
- [ ] **Step 6: Commit** `feat: desktop app packaging for macOS and Windows`

---

## Self-Review Notes

- Spec coverage: look A1/A2 + crispness (T8), coins pixelated (T8), weapons stack/auto-fire/crates (T4), budget & pads & no pause (T5, T10), base/lose (T3), respawn (T6), 10 waves/mini-boss/worm/phases/telegraphs/tower attacks/night entry/cube death/coin rain (T7, T8), sound & music (T9), English + i18n (T1, T10), open source/MIT/clean folder (T1), Windows+macOS unsigned (T11), sim/render split for LAN (T2 constraint, T11 note), stars shown only (T7, T10). Not in Phase 1 by spec: unlocks, saves, multiplayer, more maps/bosses.
