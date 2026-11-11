# LAN Co-op, Jetpack, Rare Weapons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a findable jetpack and rare 60-second weapons, then LAN co-op for up to 6 players with host/join/lobby, team credits, revives, scaling and a shared ranking.

**Architecture:** The sim stays pure and host-authoritative. Multiplayer in the sim = several `Player`s plus revive and scaling rules. A `net/` layer on the client turns the game into one of three roles: `solo` (as now), `host` (runs the sim, sends snapshots), `client` (sends inputs, renders snapshots). Transport is a small interface with two implementations: Electron IPC to a WebSocket server in the main process (real LAN, UDP discovery), and a dev relay in the Vite server for testing several browser windows on one machine.

**Tech Stack:** TypeScript, Three.js, Vitest, Electron, `ws` (WebSocket server in the main process), Node `dgram` (UDP broadcast).

**Spec:** `docs/superpowers/specs/2026-11-11-lan-jetpack-rare-design.md` (German) on top of `2026-11-11-tower-run-design.md`.

## Global Constraints

- Work directly on `main`; plain commit messages, no AI attribution.
- `src/sim/**` stays pure (no three/DOM/Math.random/Date). All new text via `t()` in English.
- Numbers from the spec: max 6 players; revive window 8 s, revive by holding E 1.5 s within 1.5 tiles, revived at 50 % HP with 2 s invulnerability; horde size × (1 + 0.35·(n−1)), enemy HP × (1 + 0.15·(n−1)); snapshots 30 per second; TCP port 47800, UDP port 47801, beacon every 1 s, entries expire after 3 s; jetpack 5 s of flight, height ~2.5, first one on a crate spot at start, then one every 90 s on a free power spot; rare card in ~1 of 10 crates, rare weapon lasts 60 s, slot key Q.
- Solo play must behave exactly as before (existing tests stay green).
- Network messages are validated (type, size ≤ 256 KB, protocol version); malformed messages are dropped.

## Review Focus

1. **Client disconnects mid-run (or while driving, holding a nest, being revived)** → its player is removed cleanly: kart freed, nest keeps its charge, no revive stuck. Test in Task 3.
2. **Host quits** → every client returns to the title with a message; no hanging lobby. Test in Task 4 (fake transport).
3. **All players down at the same time** → one credit lost, everyone respawns; with 0 credits exactly one `gameLost`. Test in Task 3.
4. **Jetpack fuel runs out above a wall or outside the reachable area** → player lands on the nearest free tile, never inside a wall. Test in Task 2.
5. **Late or out-of-order snapshots on a client** → older snapshots are ignored, the client never renders a state from the past after a newer one. Test in Task 4.

---

### Task 1: Review fixes for Stage 1

Apply the Critical/Important findings of the Stage 1 final review, each with a failing test first. (Contents come from the review report; ledgered there.)

### Task 2: Jetpack and rare weapons

**Files:** `src/sim/types.ts`, `systems/player.ts`, `systems/pickups.ts` (new: jetpack items), `systems/rare.ts` (new: rare weapons), `systems/offers.ts`, `config/rare.ts`, renderer (`pickups.ts`, `actors.ts`, `entities.ts`, `fx.ts`), `audio/sfx.ts`, `ui/hud.ts`, `input/keyboard.ts`, `i18n/en.ts`. Tests: `tests/sim/jetpack.test.ts`, `tests/sim/rare.test.ts`, input/sfx additions.

**Interfaces:**
- `Player` gains `jetFuel: number` (ticks, 0 = none), `flying: boolean`, `rare: { kind: RareKind; until: number; cooldown: number } | null`, `rareSelected: boolean`.
- `Intent` gains `jetpack: boolean` (Space held). Keyboard sends `{type:'fly', playerId}` every tick Space is held (in addition to the press-edge `jump`). Sim: if `jetFuel > 0` and not driving, `fly` makes the player fly (jump is ignored).
- Flying: `flying = true`, `jetFuel--`, movement with `BLOCKS_AIR` but never outside the inner map (`tileAt` border = wall), speed ×1.2, no contact/hazard damage, enemy bullets miss (like `air`). When `fly` stops or fuel hits 0: if the tile is free for a walker → land (small stomp radius 1, 10 dmg); else move to `nearestFree(..., BLOCKS_WALKER)`. Fuel 0 → `jetpackEmpty` event, `jetFuel` stays 0.
- `JetpackItem { id; pos }` in `s.jetpacks`; pickup radius 0.9 → `jetFuel = 300`, event `jetpackPicked`. Spawn: one at start on a random crate spot not used by a crate; then every 5400 ticks on a free power spot if none lies on the map.
- `RareKind = 'slushMachine' | 'bubblegumBazooka' | 'leafBlower' | 'pizzaCutter'`. `Card` gains `{ type: 'rare'; rare: RareKind }`. `openCrate`: with probability 0.1 the first card is replaced by a random rare card. Taking it: `p.rare = { kind, until: tick + 3600, cooldown: 0 }`, `p.rareSelected = true`, event `cardPicked`. `select` with `slot: -1` (Q) selects the rare weapon; selecting 0–5 deselects it. At `until`: `rare = null`, event `rareExpired`.
- Firing with `rareSelected`:
  - `slushMachine` (continuous, every 6 ticks): enemies in a 40° cone within 5 → `slowUntil` + `chill += 6`; `chill ≥ 60` → `frozenUntil = tick + 120` (frozen enemies do not move or attack and take ×2 damage). `Enemy` gains `chill`, `frozenUntil`, `stuckUntil`.
  - `bubblegumBazooka` (cooldown 1.5 s): bolt speed 12 range 9; on hit or wall → bubble area radius 2.5: `stuckUntil = tick + 180` for enemies inside, after 180 ticks `explode` radius 2.5, 40 dmg. Needs `Bubble { id; pos; popAt }` in state.
  - `leafBlower` (continuous): enemies in a 50° cone within 6 get knockback 14/s along the aim; an enemy whose knockback is stopped by a wall (`moveCircle` hit while `knock` > 6) takes 15 (once per 30 ticks); coins in the cone fly toward the player.
  - `pizzaCutter` (cooldown 1.2 s): projectile `behavior: 'saw'` speed 13, lives 240 ticks, reflects off walls up to 6 times (reflect the velocity component of the blocked axis), pierces everything, 12 dmg per enemy per 20 ticks.
- HUD: jetpack fuel bar; rare slot `Q` with icon, gold frame and 60 s countdown. Renderer: jetpack item and backpack with flame particles while flying; golden glint on players with a rare weapon; slush cone particles; gum bubble (pink translucent sphere); blower wind lines; spinning pizza saw. Sounds for all new events.

- [ ] Failing tests: picking up the jetpack gives 300 fuel; holding fly crosses a wall (player x passes from one side of a wall to the other), fuel goes down by the ticks flown; release over open floor lands with a stomp; fuel running out above a wall ends on a free tile (**Review Focus 4**); no flying in a kart; a jetpack respawns after 5400 ticks only if none is on the map. Rare: with a forced rng the crate offers a rare card; taking it fills the rare slot, Q selects it, after 3600 ticks `rareExpired` and slot cleared; slush freezes a blob after 60 ticks in the cone and frozen enemies don't move; bubble sticks enemies and pops for 40; blower pushes a blob away and wall-slams for 15; pizza saw bounces off a wall and hits an enemy behind the player.
- [ ] Implement → tests green → screenshots → commit `feat: findable jetpack and rare 60-second weapons`.

### Task 3: Multiplayer in the sim

**Files:** `src/sim/sim.ts`, `types.ts`, `systems/player.ts`, `systems/coop.ts` (new), `systems/nests.ts`, `systems/enemies.ts`, `systems/hordes.ts`, `config/balance.ts`. Tests: `tests/sim/coop.test.ts`.

**Interfaces:**
- `createSim(map, seed, players = 1)`; `addPlayer(s, id, name?)`, `removePlayer(s, id)`. `Player` gains `name`, `color` (index 0–5), `reviveUntil: number | null`, `reviveProgress`, `stats: { kills, revives, downs, bestCombo, score }`.
- `PLAYER_COLORS` in config (6 suit colours). Spawn offsets around `map.spawn` (ring of radius 1.2).
- Down with ≥ 2 players alive in the run: `reviveUntil = tick + 480`, no credit yet, event `playerDowned {playerId}`; a living teammate within 1.5 holding `hold` for 90 ticks → `playerRevived {playerId, by}`, hp 50 %, invuln 120, `by.stats.revives++`. Expiry → credit lost exactly as solo (`creditLost`, respawn after 180 at safe point). If every player is down or downed at once → one credit, all respawn (`teamWipe`). Solo behaviour unchanged.
- `teamScale(s) = 1 + 0.35 * (players − 1)` used for horde/rush sizes; `ENEMIES` hp × `(1 + 0.15 * (players − 1))` at spawn.
- Per-player score share: kills credited to `byPlayerId` add to that player's `stats.score` as well as `s.score`.
- `removePlayer`: frees its kart, clears its revive, removes its mines; nests keep their charge.
- Flow field already targets all living players.

- [ ] Failing tests: 3 players spawn on distinct free tiles with distinct colours; a downed player is revived by a teammate holding E 90 ticks (no credit lost) and loses a credit if nobody comes within 480 ticks; both players down at once → one credit, both respawn; with 1 credit left a team wipe ends the run with exactly one `gameLost` (**Review Focus 3**); horde size with 4 players is ×2.05; enemy hp ×1.45 with 4 players; removing a player who drives a kart frees the kart and removes the player (**Review Focus 1**); per-player kills/score add up to the team score.
- [ ] Implement → commit `feat(sim): co-op with team credits, revives and scaling`.

### Task 4: Net protocol, roles and dev relay

**Files:** `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/transport.ts`, `src/net/session.ts`, `vite.config.ts` (dev relay `/__lan`), `src/main.ts`. Tests: `tests/net/*.test.ts`.

**Interfaces:**
- `PROTOCOL_VERSION = 1`. Messages (JSON): client→host `hello {version, name}`, `input {seq, commands}`, `leave`; host→client `welcome {playerId, lobby}`, `reject {reason}`, `lobby {players: {id, name, color}[], started}`, `start {seed, players}`, `snap {tick, state, events}`, `end`, `bye {reason}`. `parseMessage(raw): Message | null` validates.
- `encodeSnapshot(s): SnapState` / `applySnapshot(view, snap)`: only what renderer/HUD/audio need (players, enemies, projectiles, areas, mines, coins, crates, offers, towers, nests, blasts, vehicles, powerups, jetpacks, bubbles, credits, alarm, score, look, elevatorOpen, phase, tick, map id). Numbers rounded to 2 decimals. A client keeps a `SimState`-shaped view built from snapshots so the renderer and HUD work unchanged.
- `Transport` interface: `send(to: number | 'host' | 'all', msg)`, `onMessage(cb)`, `onPeer(cb)`, `close()`. Implementations: `ElectronTransport` (window.cubeCrashers IPC, Task 5) and `RelayTransport` (WebSocket to `/__lan?room=...` on the dev server).
- `Session` state machine: `solo | hosting-lobby | joined-lobby | host-playing | client-playing | ended`. Host: collects inputs per player each tick (last input wins, missing = no move), steps the sim, sends `snap` every 2 ticks with the events since the last one. Client: sends `input` every tick, applies snapshots with `tick` greater than the last applied (**Review Focus 5**), interpolates positions between the last two.
- Dev relay: Vite plugin with `ws` in `configureServer`; first connection in a room is the host; forwards messages by id.

- [ ] Failing tests: `parseMessage` rejects wrong version, unknown type, oversized; snapshot round trip keeps positions within 0.01 and all entity counts; a client ignores an older snapshot after a newer one; host session with a fake transport: two clients join, lobby lists 3 players, start sends the same seed, inputs from client 2 move player 2 in the host sim; host `bye` sends clients back to the title (**Review Focus 2**).
- [ ] Implement; manual check: two browser windows on `?lan=dev` play together.
- [ ] Commit `feat(net): host-authoritative LAN protocol, snapshots, dev relay`.

### Task 5: Electron LAN server and discovery, lobby UI

**Files:** `electron/main.cjs`, `electron/lan.cjs` (new), `electron/preload.cjs`, `src/net/electron-transport.ts`, `src/ui/lobby.ts`, `src/ui/screens.ts`, `src/i18n/en.ts`, `package.json` (`ws` dependency). Tests: `tests/electron/lan.test.ts` (runs `lan.cjs` in Node with real sockets on localhost).

**Interfaces:**
- `lan.cjs`: `startHost({name, port}) → {stop, broadcast(msg), sendTo(id, msg)}`, emits `peer-join`, `peer-leave`, `message`; `startBeacon(info)` sends UDP broadcast every 1 s to 255.255.255.255:47801 (and to each interface's broadcast address); `startDiscovery(cb)` listens on 47801 and reports games, dropping entries older than 3 s; `connect(address)` for clients (WebSocket client in the main process).
- Preload exposes `lan.host(name)`, `lan.stopHost()`, `lan.discover(cb)`, `lan.join(address)`, `lan.send(msg)`, `lan.onMessage(cb)`, `lan.leave()`.
- UI: title gets **Host game** / **Join game**; name prompt (saved in localStorage); join list with live updates and an address field; lobby with players, colours, Start (host only), Leave; result screen shows the ranking table for co-op runs.

- [ ] Failing tests (Node): a host on a random port accepts two WebSocket clients and relays a message; a beacon is received by discovery on localhost and expires after 3 s; a client with the wrong version gets `reject`.
- [ ] Implement; manual check: two instances of the packaged app on one Mac find each other and play.
- [ ] Commit `feat: LAN host, discovery and lobby in the desktop app`.

### Task 6: Docs and installers

- [ ] README: co-op section (how to host/join, firewall note for Windows: allow on private networks), jetpack, rare weapons, controls (Q, Space hold).
- [ ] `npm test`, `npm run build`, `dist:mac`, `dist:win`; push `main`.
