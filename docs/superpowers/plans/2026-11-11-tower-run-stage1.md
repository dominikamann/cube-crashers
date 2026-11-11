# Tower Run – Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lane mode with one big, replayable floor ("Arcade Plaza") that has the full action core: jump/stomp, dash, combo, roaming hordes that hunt the player, nests to plant-and-hold, alarm level, credits, a drivable Crash Kart, power-ups, card choices, score and a run log.

**Architecture:** Unchanged split: pure deterministic 60 Hz sim in `src/sim` (commands in, state + events out); renderer, audio, UI and input only read state and consume events. The world becomes a tile grid (`FloorMap`); enemies navigate with a flow field toward the players. Lane-mode systems (waves, base, bosses) are deleted, everything else is adapted.

**Tech Stack:** TypeScript (strict), Vite, Three.js 0.160, Vitest, Electron, Web Audio. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-tower-run-design.md` (German; builds on `2026-11-11-cube-crashers-design.md` for look, sound, platform, language).

## Global Constraints

- Work directly on `main`. Plain conventional commit messages, no tool/AI attribution.
- `src/sim/**` must not import `three`, DOM, `window`, `Math.random` or `Date` (existing test enforces it). Randomness only via `s.rng`.
- All player-visible text in English via `t()`.
- Everything original: no protected names, characters, items or looks. The crate gets its own look (purple token chest with a star), not an orange "?" block.
- The game never pauses for building or card choice.
- Every dangerous enemy attack is telegraphed. No death by falling.
- Readability beats effects; bloom values and MSAA from design v1 stay. No coplanar overlapping faces in the world (the lane-edge z-fighting bug).
- World units = tiles. `x` right, `z` toward the camera. Tile `(tx, tz)` covers `[tx, tx+1) × [tz, tz+1)`.
- Numbers pinned by the spec: 3 credits; respawn 3 s, 2 s invulnerable, −25 % coins; alarm 0–5, +1 per 60 s, −1 per destroyed nest; hold 25 s within 6 tiles, plant by holding E 1 s, rush every ~5 s from entries ≥ 10 tiles away, counter runs back at half speed to min 0; dash 4 tiles in 0.15 s, invulnerable, 10 damage, 1.2 s cooldown; jump ~0.5 s, stomp 15 damage radius 1.2; weapon ranges ≈ −35 %, +50 % damage within 3 tiles; combo decays 3 s after last kill/coin, multiplier `1 + floor(combo/10)` max 10; coins expire after 8 s; cards stay 15 s; kart 2× walking speed, ram 40, durability 100 (small −2, Armor Block −10), fuel 20 s, respawn 45 s; boost ×1.6 for 2 s; ramp air time 0.8 s; power-ups every ~30 s, lifetime 15 s; shooter range 7, bullet 6 tiles/s, 10 damage; bomber fuse 0.6 s, radius 2, 25 damage; rammer windup 0.8 s, 30 damage, stunned 1.5 s; elite 5× HP and drops a crate; aggro radius ~10.

## Review Focus

1. **Player (or kart) pushed into a wall corner by knockback, dash or boost** → never ends up inside a wall or outside the map. Test in Task 1 (`moveCircle` fuzz) and Task 6 (kart).
2. **Going down while holding a nest / while driving / while airborne** → credit lost once, kart freed, charge stays, respawn at safe point. Test in Task 4 and 6.
3. **Last credit lost in the same tick the last nest explodes or the elevator is entered** → exactly one of `gameWon`/`gameLost`. Test in Task 4.
4. **Enemy count explosion** (long runs at alarm 5) → living enemies never exceed `ENEMY_CAP`; sim step stays fast. Test in Task 4.
5. **Card choice with nothing left to offer** (all weapons and perks maxed) → crate pays coins instead of opening empty cards. Test in Task 5.

---

## File Structure

```
src/sim/
  types.ts                 all sim types/events/commands (rewritten for Tower Run)
  sim.ts                   createSim(map, seed), stepSim
  map/tilemap.ts           Tile, FloorMap, parseMap, tileAt, moveCircle, hasLos
  map/flowfield.ts         buildFlowField, flowDir
  config/floor01.ts        "Arcade Plaza" (text grid built from rectangles, then parseMap)
  config/enemies.ts, weapons.ts, towers.ts, perks.ts, balance.ts
  systems/player.ts        movement, jump, dash, boost, down/respawn, credits
  systems/combat.ts        damageEnemy (kill credit, combo, score), projectiles, areas, explosions
  systems/weapons.ts       auto-fire with LOS, close-range bonus
  systems/coins.ts         magnet, expiry, combo refresh
  systems/enemies.ts       spawn, per-kind AI, separation, contact damage
  systems/hordes.ts        horde roaming/aggro, spawnHorde
  systems/nests.ts         nests, plant/hold, rushes, alarm, elevator
  systems/towers.ts        pads, build, tower fire
  systems/offers.ts        crates → three cards, perks, grantWeapon
  systems/vehicles.ts      Crash Kart
  systems/powerups.ts      spawn + effects
  systems/stats.ts         run-log sampling, score helpers
  systems/outcome.ts       win/lose
  (deleted: waves.ts, boss.ts, boss-worm.ts, miniboss.ts, crates.ts, config/waves.ts, config/map01.ts)
src/render/  world.ts (tile world), entities.ts, actors.ts (player, towers, kart, nests, elevator),
             pickups.ts (crates, cards, power-ups), fx.ts, renderer.ts, theme.ts, pool.ts
src/audio/   sfx.ts (new sounds + mapping), mixer.ts, music.ts, synth.ts
src/input/keyboard.ts      + jump, dash, use, hold
src/ui/      hud.ts, minimap.ts, build-menu.ts, screens.ts, ui.css
src/runlog.ts              save run log (dev server, Electron, localStorage)
electron/main.cjs, electron/preload.cjs
tests/sim/bot.ts           scripted bot used by smoke/balance tests
```

---

### Task 1: Tile map, collision, new state, lane mode removed

**Files:** create `src/sim/map/tilemap.ts`, `src/sim/config/floor01.ts`, `src/sim/config/balance.ts`; rewrite `src/sim/types.ts`, `src/sim/sim.ts`, `src/sim/systems/player.ts`, `src/render/world.ts`; delete lane/boss files and `tests/sim/waves.test.ts`, `tests/sim/boss.test.ts`; adapt remaining systems, renderer, HUD, main and tests so `npm test` and `npm run build` are green. Tests: `tests/sim/tilemap.test.ts`, `tests/sim/core.test.ts`.

**Interfaces (Produces):**
```ts
export const Tile = { Floor: 0, Wall: 1, LowWall: 2, Hazard: 3, Boost: 4, Ramp: 5 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];
export interface NestSpot { id: number; pos: Vec2; entries: Vec2[]; padIds: number[] }
export interface FloorMap {
  id: string; w: number; h: number; tiles: Tile[];          // row-major: tz * w + tx
  spawn: Vec2; elevator: Vec2;
  pads: { id: number; pos: Vec2 }[]; nestSpots: NestSpot[];
  vehicleSpots: Vec2[]; powerSpots: Vec2[]; crateSpots: Vec2[]; waypoints: Vec2[];
}
// legend: '#' wall, '.' floor, '=' low wall, '~' hazard, '>' boost, '^' ramp, 'S' spawn, 'E' elevator,
// 'N' nest spot, 'r' rush entry, 'p' pad, 'V' vehicle, '*' power-up, 'c' crate, 'w' waypoint. Markers sit on floor;
// positions are tile centres. Entries and pads belong to the nearest nest spot (pads only within 9 tiles).
export function parseMap(id: string, rows: string[]): FloorMap;   // throws on ragged rows, missing S/E, open border
export function tileAt(m: FloorMap, x: number, z: number): Tile;  // outside the map = Wall
export type Blocks = (t: Tile) => boolean;
export const BLOCKS_WALKER: Blocks;   // Wall, LowWall
export const BLOCKS_ENEMY: Blocks;    // Wall, LowWall, Hazard
export const BLOCKS_KART: Blocks;     // Wall, LowWall
export const BLOCKS_AIR: Blocks;      // Wall
export function moveCircle(m: FloorMap, pos: Vec2, dx: number, dz: number, r: number, blocks: Blocks): { hitX: boolean; hitZ: boolean }; // mutates pos, axis-separated
export function hasLos(m: FloorMap, a: Vec2, b: Vec2): boolean;   // only Wall blocks sight and shots
export function reachable(m: FloorMap, from: Vec2, blocks: Blocks): Uint8Array; // BFS mask, used by tests and the bot
```
`SimState` (new fields; `base`, `wave`, `boss` removed): `map: FloorMap; credits: number; alarm: { level: number; nextAt: number }; nests: Nest[]; hordes: Horde[]; vehicles: Vehicle[]; vehicleRespawns: { spot: number; at: number }[]; powerups: Powerup[]; nextPowerupAt: number; offers: Offer[]; crates: Crate[]; score: number; stats: RunStats; elevatorOpen: boolean`. `Player` gains `facing, air, dashTicks, dashDir, dashCharges, dashRecharge, invulnUntil, combo, comboUntil, perks, vehicleId, boostUntil, rapidUntil, magnetUntil, safePoint, plantTicks`. Placeholders for types owned by later tasks are declared here with their final fields (see those tasks).

`floor01.ts`: 70 × 70, built with small helpers (`fill`, `rect`, `put`) into a char grid, then `parseMap`. Layout rules from spec §7: spawn/elevator bottom centre; 7 nest spots each with ≥ 2 approaches, 3–4 pads and 2–3 rush entries; a kart circuit with boost tiles and 2 ramps over low walls; open plaza in the middle; hazard strips; ≥ 3 vehicle spots, ≥ 6 power-up spots, ≥ 6 crate spots, ≥ 16 waypoints.

Player movement: `PLAYER_SPEED = 6`, radius 0.4, `moveCircle` with `BLOCKS_WALKER`; no more `PLAYER_AREA`.

Renderer world: instanced floor tiles (checker by tile type), walls as instanced boxes (height 1.4), low walls 0.5, hazard/boost/ramp tiles distinct; pads at `map.pads`; camera follows the player: position `(p.x, 15, p.z + 11)`, looks at `(p.x, 0, p.z − 2)`; fog and shadow camera follow.

- [ ] **Step 1: Failing tests** `tilemap.test.ts`: `parseMap` reads a 5×5 sample (spawn centre, wall border); throws on a hole in the border; `moveCircle` stops at a wall and slides along it; **fuzz**: 5 000 random moves (|d| ≤ 3) of a radius-0.4 circle in `floor01` never leave it overlapping a blocking tile (**Review Focus 1**); `hasLos` false through a wall, true over a low wall; `floor01`: 70×70, 7 nest spots each with ≥ 3 pads and ≥ 2 entries at distance ≥ 10, and spawn, elevator, every nest spot, pad, entry, vehicle/power/crate spot and waypoint are reachable from spawn with `BLOCKS_ENEMY`. `core.test.ts`: player moves 6 tiles/s on open floor and stops at a wall.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, delete lane mode, adapt the rest (HUD shows only HP/coins/weapons for now). **Step 4:** `npm test` and `npm run build` → green; screenshot `?demo=1` shows the tile world.
- [ ] **Step 5: Commit** `feat(sim): tile map floor with collision, replace lane mode`

### Task 2: Player verbs – jump, dash, combo, coins, credits, score

**Files:** `systems/player.ts`, `systems/combat.ts`, `systems/weapons.ts`, `systems/coins.ts`, `systems/stats.ts`, `config/weapons.ts`, `config/balance.ts`. Tests: `tests/sim/verbs.test.ts`, adapt `weapons.test.ts`, `player.test.ts`.

**Interfaces:**
- Commands: `{type:'move',playerId,dir}`, `{type:'jump',playerId}`, `{type:'dash',playerId}`, `{type:'use',playerId}`, `{type:'hold',playerId}`, `{type:'build',playerId,padId,tower}`.
- `damageEnemy(s, e, amount, source: DamageSource, byPlayerId?: number)`; `DamageSource = WeaponKind | TowerKind | 'stomp' | 'dash' | 'kart' | 'explosion' | 'bomb'`. On a kill by a player: `combo++`, `comboUntil = tick + 180`, `score += ENEMIES[kind].score * mult`, coins drop with `value = round(mult * (1 + 0.25 * perks.greed))`, `stats.kills[category]++`; `comboUp {playerId, mult}` when the multiplier rises; `comboLost {playerId}` when it expires above ×1.
- `comboMult(p): number` = `min(10, 1 + floor(p.combo / 10))`.
- Jump: `air = 30` ticks; while `air > 0` no contact damage, no hazard damage, hostile bullets miss; on landing `damageInRadius(pos, 1.2 + 0.5*perks.stomp, 15 + 10*perks.stomp, 'stomp')` + knockback; events `jump`, `stomp {pos, radius}`.
- Dash: needs a charge (`1 + perks.dash`, recharge 72 ticks each); 9 ticks at 26.7 tiles/s along `facing` (or move dir), `invulnUntil` covers it, enemies touched take 10 (`'dash'`) once; event `dash`.
- Weapons: ranges ×0.65 (blaster 6, candy 4.5, hotdog 5.5, boomerang 5, disco 4, sword unchanged); targets need `hasLos`; bolts die on Wall; hits by a player within 3 tiles ×1.5.
- Coins: `expiresAt = spawn + 480`; no vacuum; pickup refreshes `comboUntil`; magnet radius `2.5 + 1.5*perks.magnet`.
- Down: `credits--`, `playerDown`, `creditLost {credits}`; if `credits === 0` → `phase = 'lost'`, `gameLost`; else respawn after 180 ticks at `safePoint`, `invulnUntil = tick + 120`, coins −25 %.
- Hazard tile on foot (not airborne): 10 damage/s. Boost tile: `boostUntil = tick + 120`, speed ×1.6. `perks.speed`: +12 % each. `perks.regen`: +1 HP/s each.
- `RunStats { kills: Record<'weapon'|'tower'|'kart'|'stomp'|'dash'|'other', number>; maxCombo; damageTaken; downs; distance; idleTicks; samples: {t; distance; idleTicks; kills; alarm}[] }`, a sample every 600 ticks; an idle tick = player alive and moved < 0.005.

- [ ] **Step 1: Failing tests:** jump over a blob takes no contact damage and the landing stomp damages it by 15; dash moves ~4 tiles, damages a blob in the path by 10, cannot be used again for 72 ticks, and stops at a wall; 10 kills in a row give ×2 and the 11th coin has value 2; combo resets 181 ticks after the last kill with `comboLost`; a coin disappears after 480 ticks; a blob 2 tiles away takes 6 from the blaster (4 × 1.5), one 5 tiles away takes 4; no shot at an enemy behind a wall; third down ends the run with exactly one `gameLost`; first down respawns at the safe point after 180 ticks with 2 s invulnerability; standing on hazard costs 10 HP in 60 ticks, jumping across costs 0.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS (whole suite).
- [ ] **Step 5: Commit** `feat(sim): jump, dash, combo, expiring coins, credits`

### Task 3: Enemies that hunt – flow field, hordes, new kinds

**Files:** `map/flowfield.ts`, `systems/enemies.ts`, `systems/hordes.ts`, `config/enemies.ts`. Tests: `tests/sim/flowfield.test.ts`, `tests/sim/enemies.test.ts`.

**Interfaces:**
- `buildFlowField(m, targets: Vec2[], blocks): Int16Array` (BFS distance in tiles, −1 unreachable); `flowDir(m, field, pos): Vec2` (unit vector toward the lowest neighbour, no corner cutting; zero if unreachable). `s.flow` rebuilt every 15 ticks from living players' positions (not serialised: recomputed on demand).
- `EnemyKind = 'blob' | 'hunter' | 'tank' | 'splitter' | 'splitling' | 'shooter' | 'bomber' | 'rammer'`. `Enemy` gains `hordeId: number | null; elite: boolean; state: 'move' | 'windup' | 'charge' | 'stunned' | 'fuse'; stateUntil: number; dir: Vec2; knock: Vec2; cooldownUntil: number; ramHitUntil: number`.
- `ENEMIES[kind]`: `{ hp, speed, radius, coins, score, contactDamage }` – blob 10/1.8, hunter 8/4.2, tank 60/1.0, splitter 20/1.6, splitling 6/2.6, shooter 14/1.6, bomber 12/3.6, rammer 40/1.4.
- `Horde { id; waypoint: Vec2; aggro: boolean; rush: boolean; nextWanderAt: number }`; `spawnHorde(s, pos, comp: {kind; count}[], opts?: {rush?: boolean; eliteChance?: number}): Horde`; `HORDE_COMPS` named mixes; aggro when any member is within 10 tiles of a living player with LOS, or was damaged; drops aggro when every player is > 22 away (never for rush hordes). Non-aggro members steer to the horde waypoint (new random waypoint within 25 tiles every 6–10 s).
- Movement: desired dir (flow field when aggro, direct steer when within 1.5 tiles with LOS) × speed (× 0.5 if slowed) + knockback (decays ×0.85/tick) + separation from neighbours (spatial hash, cell 1), then `moveCircle` with `BLOCKS_ENEMY`.
- Shooter: keeps 5–8 tiles, with LOS and cooldown ready → `windup` 24 ticks (`enemyWindup {id, kind, pos, dir}`) → hostile bullet (speed 6, damage 10), cooldown 132 ticks. Hostile bullets hit players on the ground (10) and die on walls.
- Bomber: within 1.6 tiles → `fuse` 36 ticks (`enemyWindup`) → `explode(s, pos, 2, {player: 25, enemy: 30, tower: 20})`, event `explosion {pos, radius}`. A bomber killed earlier explodes at once with radius 1.8, hurting enemies only.
- Rammer: LOS, distance < 9, cooldown ready → `windup` 48 ticks with locked `dir` (`enemyWindup`) → `charge` at 14 tiles/s for up to 12 tiles; hits a player: 30 + knockback; a tower in the way: 20; hits a wall → `stunned` 90 ticks; cooldown 180.
- Elite: HP ×5, radius ×1.4, contact ×1.5, drops a crate (`s.crates.push`) on death.
- Contact damage as before (per second, only on the ground, not while invulnerable or driving).

- [ ] **Step 1: Failing tests:** flow field leads around a wall (enemy placed behind a wall reaches the player within N ticks without ever overlapping a wall); unreachable target → enemy stays; a horde far away wanders and does not approach; the same horde 8 tiles away with LOS turns aggro and all members close in; shooter fires after a windup event and the bullet takes 10 HP; a jumping player is not hit; bomber explodes 36 ticks after reaching the player (25 damage, also kills a blob next to it); a killed bomber damages neighbouring enemies but not the player; rammer emits `enemyWindup`, then crosses 8 tiles in < 45 ticks, and is stunned after hitting a wall; stepping aside during the windup avoids all damage; an elite has 5× HP and leaves a crate; 150 enemies in a corridor never overlap walls after 300 ticks.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): hunting hordes with flow field, shooter, bomber, rammer, elites`

### Task 4: Nests, alarm, elevator, winning and losing

**Files:** `systems/nests.ts`, `systems/outcome.ts`, `sim.ts`, `config/balance.ts`. Tests: `tests/sim/nests.test.ts`, `tests/sim/bot.ts`, `tests/sim/run.test.ts`.

**Interfaces:**
- `Nest { id; spotId; pos; state: 'idle' | 'planted' | 'destroyed'; progress: number; nextSpawnAt: number; nextRushAt: number }`. `createSim` picks `NESTS_PER_FLOOR = 4` of the 7 spots with the rng (never the one nearest to spawn twice in a row is not required), gives each nest one starting horde and places 4 roaming hordes at waypoints ≥ 14 tiles from spawn.
- Planting: a living player on foot within 2.5 tiles of an idle nest who sends `hold` gains `plantTicks`; at 60 → `planted`, event `nestPlanted {id}`. Releasing resets `plantTicks`.
- Holding: `HOLD_TICKS = 1500`. A living player within 6 tiles → `progress += 1` and a rush horde every 300 ticks at a random entry of the spot (size `6 + 2*alarm`, mix by alarm level, `rush: true`); otherwise `progress = max(0, progress − 0.5)`. At `HOLD_TICKS`: `destroyed`, `nestDestroyed {id, pos}`, `explode` radius 6 (100 to enemies only), 25 coins, a crate, `alarm.level = max(0, level − 1)` with the timer reset, every player's `safePoint = nest.pos`.
- Idle nests spawn a roaming horde beside themselves every `1800 / (1 + 0.25*alarm)` ticks. `ENEMY_CAP = 160`: no spawn of any kind above it.
- Alarm: +1 every 3600 ticks up to 5, event `alarmChanged {level}`. Per level: horde size ×(1 + 0.2·level), enemy speed ×(1 + 0.05·level). Level 5: `look = 'night'`, an "overload" rush horde every 480 ticks at a waypoint 15–30 tiles from a player; below 5: `look = 'day'`.
- All nests destroyed → `elevatorOpen = true`, event `elevatorOpen`. A living player within 1.5 tiles of `map.elevator` → `phase = 'won'`, `gameWon {score}` with `score += credits*500 + max(0, 360 − seconds)*10`. `updateOutcome` runs last; loss is decided in `damagePlayer`; once `phase !== 'playing'` nothing else fires (**Review Focus 3**).
- `tests/sim/bot.ts`: `botCommands(s): Command[]` – walks (own BFS over walkable tiles) to the nearest idle/planted nest, holds E, stays in the radius, dashes away when ≥ 3 enemies are within 1.5 tiles, walks to the elevator when open, picks the nearest card.

- [ ] **Step 1: Failing tests:** 4 nests exist, different seeds pick different spot sets; holding E for 60 ticks next to a nest plants it, 59 does not; progress rises only with a player inside 6 tiles and falls at half speed outside, never below 0, and the nest stays planted; rushes spawn at an entry ≥ 10 tiles away only while a player holds; completing the hold destroys the nest, lowers the alarm by 1 and moves the safe point; going down during a hold costs one credit and keeps the charge (**Review Focus 2**); alarm rises every 3600 ticks and caps at 5 with `look === 'night'`; enemy count never exceeds 160 during 15 sim minutes at alarm 5 (**Review Focus 4**); elevator opens after the last nest and entering it wins exactly once; a player with 1 credit who dies in the tick the elevator is entered produces exactly one outcome event (**Review Focus 3**). `run.test.ts`: the bot with all weapons at level 5 wins the floor within 12 sim minutes on seeds 1–3; a player who never moves and never presses anything does not win within 12 minutes and ends `lost`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): nests with plant-and-hold, alarm level, elevator, run outcome`

### Task 5: Towers on the new map, crates as three cards, perks

**Files:** `systems/towers.ts`, `systems/offers.ts` (replaces `crates.ts`), `config/perks.ts`, `config/towers.ts`. Tests: adapt `towers.test.ts`; `tests/sim/offers.test.ts`.

**Interfaces:**
- Towers: unchanged API (`padAt`, `tryBuild`, `updateTowers`), pads from `s.map.pads`, targets need LOS; costs laser 12, popcorn 20, frost 15; tower shots credit no player (`stats.kills.tower`).
- `PerkKind = 'speed' | 'dash' | 'magnet' | 'greed' | 'regen' | 'stomp'`, `MAX_PERK = 3` (`dash` max 2).
- `Crate { id; pos }` – touching it (0.8) opens an `Offer { id; pos; cards: Card[]; cardPos: Vec2[]; armedAt; expiresAt }`; `Card = {type:'weapon'; weapon: WeaponKind} | {type:'perk'; perk: PerkKind}`. Three distinct cards drawn by rng from: weapons not held (if < 6 held), level-ups of held weapons (< 5), perks below max. Card positions: 1.6 tiles apart on a line through `pos`, moved onto free tiles. Armed after 30 ticks; touching a card (0.7) applies it (`grantWeapon` / `perks[k]++`), removes the offer, `cardPicked {playerId, card}`. Expires after 900 ticks. Event `offerOpened {pos}`.
- Fewer than 3 options → fewer cards; none → no offer, `+25` coins, event `crateCoins {playerId, coins}` (**Review Focus 5**).
- `createSim` puts crates on 3 random crate spots.

- [ ] **Step 1: Failing tests:** touching a crate opens 3 distinct cards; walking into a weapon card adds/levels the weapon and removes the other cards; a perk card raises the perk and its effect is active (speed: 6.72 tiles/s); cards cannot be taken in the first 30 ticks; the offer disappears after 900 ticks; with everything maxed the crate pays 25 coins and opens nothing; build tests from Phase 1 pass on `floor01` pads; a tower does not shoot through a wall.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): three-card crates with perks, towers on floor pads`

### Task 6: Crash Kart and power-ups

**Files:** `systems/vehicles.ts`, `systems/powerups.ts`. Tests: `tests/sim/vehicles.test.ts`, `tests/sim/powerups.test.ts`.

**Interfaces:**
- `Vehicle { id; kind: 'kart'; pos; vel: Vec2; hp: number; fuel: number; driverId: number | null; air: number; spot: number }`. `createSim` places karts on 2 random vehicle spots.
- `use`: driving → exit (player placed beside the kart on a free tile); else a kart within 1.8 tiles with no driver → enter (`kartEnter`). Jump and dash are ignored while driving; weapons keep firing; `hold`/build do not work from the kart.
- Driving: target velocity = move dir × 12 (×1.6 while boosted); velocity approaches it with 30 tiles/s²; friction 10 tiles/s² without input; `moveCircle` radius 0.7 with `BLOCKS_KART` (airborne: `BLOCKS_AIR`); a wall hit zeroes that velocity component. Fuel 1200 ticks, used while speed > 1. Player position = kart position.
- Ram: speed > 4 and an enemy within `0.7 + e.radius` whose `ramHitUntil < tick` → `damageEnemy(40, 'kart', driver)`, knockback along the velocity, `ramHitUntil = tick + 30`, durability −10 for tank or elite else −2; event `kartRam`.
- Ramp tile at speed > 6 → `air = 48`, `kartJump`; landing → `damageInRadius(2.5, 30, 'kart')`, `kartLand {pos}`. Boost tile → `boostUntil`, `kartBoost`.
- While driving: no contact or hazard damage; hostile bullets, explosions and rammer hits reduce kart `hp` by their player damage instead of player HP.
- `hp ≤ 0` or `fuel ≤ 0` → `kartDestroyed {pos}`, driver ejected with `invulnUntil = tick + 60`, respawn entry `{spot, at: tick + 2700}`. A driver who goes down (cannot normally happen) frees the kart.
- `Powerup { id; kind: 'magnet' | 'rapid' | 'bomb' | 'frost' | 'heart'; pos; expiresAt }`; every 1800 ticks one spawns at a random free power spot (lifetime 900), `powerupSpawned {kind, pos}`; pickup radius 0.9 (also from the kart), `powerupPicked {kind, playerId}`. Effects: magnet 480 ticks (every coin flies to the player at 20 tiles/s and does not expire meanwhile); rapid 480 ticks (weapon cooldowns tick twice as fast); bomb `explode` radius 8, 60 to enemies; frost `slowUntil = tick + 300` on all enemies; heart +50 HP up to max.

- [ ] **Step 1: Failing tests:** E next to a kart enters, E again exits onto a free tile; the kart reaches 12 tiles/s and needs time to reverse; ramming a blob kills it (40 ≥ 10), costs 2 durability and credits the driver's combo; a tank costs 10; fuel runs out after 20 s of driving and ejects the driver; the kart stops at a wall and at a low wall, but clears the low wall after a ramp; landing damages enemies; a shooter bullet lowers kart hp, not player hp; a destroyed kart reappears on its spot after 2700 ticks; **fuzz** 3 000 ticks of random driving never leaves the kart inside a blocking tile (**Review Focus 1**); each power-up has its effect (magnet pulls a coin 20 tiles away; rapid doubles shots in 5 s; bomb kills blobs within 8; frost slows; heart heals 50, capped).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): Crash Kart with boost pads and ramps, power-ups`

### Task 7: Renderer for the new world

**Files:** `src/render/world.ts`, `entities.ts`, `actors.ts`, `pickups.ts`, `fx.ts`, `renderer.ts`. Test: extend `tests/render/fx.test.ts`.

- Looks for the new kinds in `ENEMY_LOOK` (hunter low and pointed, orange; shooter tall, teal with one big eye; bomber round-ish red block with a fuse that blinks faster during `fuse`; rammer wide grey-blue with horns); elites ×1.4 with a pulsing magenta ring; state tints: `windup` flashes white, `stunned` grey.
- Telegraphs: rammer line (12 × 0.6 red quad along `dir`), bomber ring (radius 2), shooter muzzle flash; hostile bullets as red glowing cubes.
- Nests: cluster of dark glitch cubes with magenta glow that jitter; when planted a ground ring of radius 6 and a progress arc; destroyed → 200-cube burst. Elevator: platform, closed gate; open → cyan light column.
- Player: jump arc (`y = sin`) with squash on landing, dash trail cubes, blinking while invulnerable; down pose as before.
- Kart: voxel kart (body, 4 wheels, spoiler, glowing engine); tilts when turning, hops on ramps, smoke cubes below 30 durability.
- Pickups: token-chest crate (purple, gold star); cards as upright panels with a canvas-drawn pixel icon + short label, bobbing, with a ground glow; power-ups as spinning glowing cubes with an icon per kind and a shrinking ring showing remaining lifetime.
- Coins blink in their last 180 ticks. Fx for `stomp` (ring of cubes), `explosion`, `kartRam` (burst + small shake), `kartLand`, `nestDestroyed` (big shake), `comboUp` (short flash of the player's visor colour).
- Alarm 5 uses the night theme (already driven by `s.look`).

- [ ] **Step 1: Failing test:** `fx.update` with `nestDestroyed` and with `explosion` produces shake > 0; with `stomp` it does not.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS; screenshots of `?demo=plaza` (hordes, kart, nest hold, cards, power-up) in day and night are crisp and readable; no z-fighting at tile borders.
- [ ] **Step 5: Commit** `feat(render): tile world, hunting enemies, nests, kart, cards and power-ups`

### Task 8: Input, HUD, minimap, sounds, screens, run log, wiring

**Files:** `src/input/keyboard.ts`, `src/ui/hud.ts`, `src/ui/minimap.ts`, `src/ui/screens.ts`, `src/ui/ui.css`, `src/audio/sfx.ts`, `src/runlog.ts`, `src/main.ts`, `src/i18n/en.ts`, `vite.config.ts`, `electron/main.cjs`, `electron/preload.cjs`, `.gitignore`. Tests: adapt `tests/input.test.ts`, `tests/audio/sfx.test.ts`; `tests/runlog.test.ts`.

- Keyboard: `Space` → one `jump` per press; `ShiftLeft/Right` → one `dash`; `KeyE` down edge → `use`; while `KeyE` is held → `hold` every tick; build menu as before (hold E ≥ 150 ms on a free pad).
- Sounds (all synthesized, each new event mapped; the test fixture lists every event type): `jump`, `stomp`, `dash`, `comboUp` (pitch rises with the multiplier), `comboLost`, `enemyWindup` per kind, `enemyShot`, `explosion`, `nestPlanted`, `nestDestroyed`, `alarmChanged` (siren blip; long siren at 5), `elevatorOpen`, `offerOpened`, `cardPicked`, `crateCoins`, `powerupSpawned`, `powerupPicked`, `kartEnter`, `kartRam`, `kartBoost`, `kartJump`, `kartLand`, `kartDestroyed`, `creditLost`. Music: `battle`; `boss` track while alarm is 5; `menu` on the title.
- HUD: credits (three token icons), alarm meter (5 segments, pulses at 5), `Nests 1/4`, score, coins, big combo `×N` with a draining timer bar, HP, dash charges, kart fuel + durability while driving, hold progress bar while a nest is planted and the player is near, context hint (`Hold E to plant`, `E: drive`, `Hold E to build`), toasts for alarm changes, power-up spawns, picked cards, `Elevator open!`.
- Minimap (bottom right, canvas): tiles drawn once; dots for player, nests (by state), elevator, karts, power-ups, crates/cards, and enemy hordes as faint red dots.
- Screens: win/lose show score, time, kills, best combo, credits left, and the local top 5 (`localStorage`, try/catch).
- Run log: `buildRunLog(s): RunLog` (pure: result, seed, duration, score, `stats`); `saveRunLog(log)` → dev server `POST /__runlog` (Vite plugin writes `logs/run-<timestamp>.json`), Electron `window.cubeCrashers.saveRunLog` (preload → main writes to `userData/runs/`), and the last 20 in `localStorage`. `logs/` is git-ignored.
- `main.ts`: `createSim(floor01, seed)`; `?demo=plaza` starts armed next to a nest; `?seed=N` fixes the seed.

- [ ] **Step 1: Failing tests:** Space gives exactly one `jump` per press, Shift one `dash`, E edge one `use`, held E a `hold` each tick; every sim event type maps to ≥ 1 known sound (except a short allow-list); `comboUp` pitch grows with the multiplier; `buildRunLog` on a finished bot run contains result, duration and one sample per 10 s whose distances sum to `stats.distance`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS; `npm run build` green; screenshot of the HUD in play.
- [ ] **Step 5: Commit** `feat: Tower Run HUD, minimap, sounds, run log and controls`

### Task 9: Balance pass, docs, installers

**Files:** `config/*`, `README.md`, `docs/ideas.md`, `docs/design/screenshots/*`.

- [ ] **Step 1:** Run the bot with the **starter loadout** on seeds 1–10 and print per seed: result, minutes, downs, max combo, idle share. Tune `config/balance.ts`, enemy and horde values until the starter bot wins on roughly half the seeds within 4–8 minutes and never wins without moving; add a test asserting the bot's idle share is < 20 % and that at least 3 of 10 seeds are won and at least 2 are lost or take a credit.
- [ ] **Step 2:** README: new description, controls, enemies, kart, power-ups, perks, architecture changes, roadmap (Stage 2: five floors, shaft ride, elevator shop, bosses; Stage 3: unlocks; then LAN). `docs/ideas.md`: lane mode as a possible extra mode.
- [ ] **Step 3:** New screenshots; `npm test`, `npm run build`, `npm run dist:mac`, `npm run dist:win` succeed.
- [ ] **Step 4: Commit** `feat: balance Tower Run stage 1, update docs` and push `main`.
