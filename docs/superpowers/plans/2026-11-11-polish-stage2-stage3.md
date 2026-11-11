# Graphics, Colour Choice, Stage 2 and Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quality settings and a nicer look, own suit colour, a 5-floor run (themes, shaft ride, elevator shop, two bosses), unlocks, two new vehicles and an endless mode.

**Architecture:** Unchanged sim/render/net split. A run is a sequence of `FloorDef`s; `SimState.run` tracks mode, floor and stage (`floor | shaft | shop`). Changing floor swaps `s.map` and resets floor-bound entities. The renderer rebuilds the world when the map id changes. Unlocks live in a local profile and are passed into `createSim`.

**Spec:** `docs/superpowers/specs/2026-11-11-polish-stage2-stage3-design.md` (German).

## Global Constraints

- Work on `main`, commit and push after every task. Plain commit messages, no AI attribution.
- `src/sim/**` stays pure; all text via `t()`; every new client command is validated in `sanitizeCommands`.
- Solo and LAN both use the same run flow. Existing behaviour of a single floor stays reachable as "Quick floor".
- Readability beats effects at every quality level.

## Review Focus

1. Changing floor while a player is down, driving, flying or holding a nest → clean state on the next floor (no kart id pointing nowhere, no revive timer carried over). Test in Task 2.
2. A client joins the shop/shaft stage via snapshot with a different map id → renders the right map. Test in Task 2.
3. Buying with too few coins, buying twice, buying the team credit twice → refused, coins unchanged. Test in Task 2.
4. Boss dies in the same tick the last player goes down → exactly one outcome for the floor. Test in Task 4.
5. Unlock profile missing, corrupt or from an older version → defaults, no crash. Test in Task 5.

### Task 1: Quality settings, look upgrade, colour choice
- `GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'` in settings; `renderer.setQuality(q)` rebuilds composer, shadows, pixel ratio; SSAO pass on ultra; vignette/grade shader pass from medium.
- Baked floor darkening next to walls, lighter wall caps, sky gradient dome, warm key + cool fill light, theme-driven decoration props, ambient dust/glitter particles, enemy hit flash (event `enemyHit` gains `id`), optional floating damage numbers (setting).
- `settings.color: number | null`; solo player colour; `hello.color` preferred colour, host assigns it if free.
- Tests: `enemyHit` carries the id; hello with a free colour gets it, with a taken one gets another; renderer theme blend still passes; settings default/merge.
- Screenshots per quality level.

### Task 2: Floors, run flow, shop
- `FloorDef { id; theme: ThemeId; kind: 'nests' | 'boss'; boss?: 'megaBlock' | 'worm'; map: FloorMap }`; `RUN_FLOORS` (plaza, candy, megaArena, neon, rooftop); `createSim(map|floors, seed, { mode })`.
- `s.run = { mode, floor, stage, stageUntil }`; elevator entry → `floorCleared` → stage `shaft` (Task 3 fills it; until then straight to `shop`) → `shop` (25 s or all ready) → `enterFloor(s, next)`.
- Candy Factory map with conveyor tiles (`Tile.Conveyor*` push 2.5 tiles/s); Neon City map (street grid, permanent night, elite chance +).
- Shop: `buy {offer}`, `ready`; offers per player from rng: weapon level-up, perk, full heal, team credit (cost 150, once per shop). Coins checked; events `bought`, `buyDenied`.
- Renderer: `setMap`; themes for floors (palettes, fog, decor set); HUD floor indicator and shop overlay; snapshot carries map id + run.
- Tests: run flow from elevator to next floor keeps weapons/coins/credits and resets towers/karts/enemies/alarm; floor change while driving/down/flying (Review Focus 1); buy rules (Review Focus 3); conveyor pushes; client view switches map from snapshot (Review Focus 2); bot wins floors 1, 2 and 4 on Medium.

### Task 3: Shaft ride
- Shaft map (round platform ~16 tiles across, walls around, open sky look); `swarmer` enemy: flies (ignores walls), weak, comes in waves from the edge toward players for 45 s; stage ends → shop.
- Tests: swarmers spawn and fly over walls, players can kill them, stage ends after 45 s even with swarmers alive, nobody can fall out.

### Task 4: Bosses
- Mega Block arena map; `megaBlock` boss: hp scaled by team/difficulty, 3 phases at 66/33 %, stomp blasts (reuse `Blast`), line shockwaves (telegraphed lanes), reinforcement hordes, attacks towers. Boss HUD bar.
- Segment Worm on the rooftop: segments as enemies (`wormSegment`), chain movement steering toward players around walls, split rule (≥ 3 each side, max 4 worms), telegraphed strikes, coin burst; boss death opens the elevator.
- Tests: phases fire once; telegraphs hit only players inside; worm split rules; boss kill + last player down same tick → one outcome (Review Focus 4); bot can beat both on Medium with full weapons.

### Task 5: Unlocks, vehicles, endless
- `profile.ts` (localStorage, versioned, try/catch): tickets, unlocked set; tickets from run results; Unlocks screen.
- Locked weapons excluded from crates; locked vehicles not placed; LAN: union of lobby unlocks (hello carries them, validated).
- `Vehicle.kind: 'kart' | 'roller' | 'hoverboard'` with their stats; hoverboard ignores hazard and low walls (no air needed), roller crushes.
- Endless mode: nests respawn 60 s after destruction at a free spot, alarm keeps climbing (speed up beyond 5), separate best list.
- Tests: profile defaults/corrupt data (Review Focus 5); ticket math; locked weapon never offered; vehicle stats; endless nest respawn and alarm beyond 5.

### Task 6: Balance, docs, release
- Bot runs over the full run on seeds; tune. README (run, shop, shaft, bosses, unlocks, vehicles, endless, graphics), new GIF, installers, release 0.3.0 with notes.
