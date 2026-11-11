# Cube Crashers

**A fast voxel lane shooter with tower defense elements.** Waves of retro arcade monsters roll down the
lane toward your arcade cabinet. Grab wild auto-firing weapons, from a laser sword to a candy cannon
to a hotdog slinger, build towers on glowing pads without ever pausing the action, and crash the
bosses into a thousand glowing cubes.

> **Status: in development (Phase 1, single player).** The game logic is complete and tested.
> Graphics, sound, menus and the desktop app are being built right now. See the [roadmap](#roadmap).

Runs on **Windows and macOS**. Single player first; **LAN co-op for up to 6 players** comes next.

---

## Contents

- [The game](#the-game)
- [How to play](#how-to-play)
- [Weapons, towers, enemies, bosses](#weapons-towers-enemies-bosses)
- [Look and sound](#look-and-sound)
- [Getting started (development)](#getting-started-development)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Building the desktop app](#building-the-desktop-app)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The game

The core idea: **beat up retro monsters with cool (and slightly ridiculous) tech.**

- A horde comes down a lane from the top of the screen. You stand at the bottom, in front of your
  **arcade cabinet**, which is your base.
- Every monster that gets through damages the cabinet. If the cabinet's health drops to zero, the round is lost.
- One round covers **10 waves** and takes about 10–15 minutes. A **mini-boss** shows up in wave 5 and
  the **Segment Worm** in wave 10. Beat the worm and you win.
- After a win you get **1–3 stars**, depending on how much health your cabinet has left.

## How to play

| Key | Action |
|---|---|
| `W` `A` `S` `D` / arrow keys | Move |
| `E` (hold, on a build pad) | Open the build menu |
| `1` `2` `3` / mouse click | Pick a tower in the build menu |
| `Esc` / `P` | Pause |
| `F11` | Toggle fullscreen (desktop app) |

- **Your weapons fire on their own** at the nearest monster. You focus on moving, dodging, collecting
  and building.
- **Weapon crates** roll down the lane with the horde. Walk into one or shoot it open to get a new weapon.
  New weapons are added to the ones you already carry, up to 6. If you find a weapon you already
  have, it levels up (max level 5).
- **Coins** drop from defeated monsters and fly to you when you get close. Coins are your budget for
  towers. Picking up coins in quick succession raises the pitch of the coin sound.
- **Build pads** are glowing platforms at fixed spots on the map. Stand on one, hold `E`, pick a tower.
  The game keeps running while you build.
- If you go down, you get back up after 3 seconds at your start position. You lose 25 % of your coins
  but keep all your weapons.

## Weapons, towers, enemies, bosses

### Weapons

| Weapon | What it does |
|---|---|
| **Pixel Blaster** | Starter weapon. Straight bolts; more bolts at higher levels. |
| **Laser Sword** | 360° swing that hits everything around you; the reach grows with each level. |
| **Candy Cannon** | Fires a spread of colourful candy; one more candy per level. |
| **Hotdog Slinger** | Lobs a hotdog that leaves a damaging mustard puddle. |
| **Joystick Boomerang** | Flies out and comes back, hitting everything on the way. |
| **Disco Ball** | Orbits you and zaps the nearest monsters with light beams; one more beam per level. |

### Towers

| Tower | Cost | What it does |
|---|---|---|
| **Laser Tower** | 15 | Fast single-target laser. |
| **Popcorn Mortar** | 25 | Lobs popcorn shells that hit everything in an area. |
| **Frost Machine** | 20 | Cold pulses that slow monsters to half speed. |

### Enemies

All monsters are original voxel creatures in the style of old arcade games.

| Enemy | Description |
|---|---|
| **Hop Blob** | The standard monster. Hops along in large numbers. |
| **Dasher** | Fast and fragile. |
| **Armor Block** | Slow, heavily armoured, hurts a lot. |
| **Splitter** | Splits into two small splitlings when destroyed. |

### Bosses

Every boss:

- has **three phases** (at 66 % and 33 % health) and calls reinforcements at each change;
- uses **telegraphed attacks**: a red ring on the ground warns you before the impact, so you can dodge;
- **attacks your towers** too;
- switches the world to the **night look** when it arrives;
- bursts into **hundreds of glowing cubes** and a shower of coins when it dies.

| Boss | Wave | Description |
|---|---|---|
| **Mega Block** | 5 | A huge armoured mini-boss with ground slams. |
| **Segment Worm** | 10 | A giant worm made of segments. Destroy a middle segment and it **splits in two**. Parts smaller than 3 segments no longer split, and at most 4 worms can exist at once. |

## Look and sound

- **Day look (default):** a bright, colourful voxel diorama. Neon glow is reserved for the action:
  bolts, eyes, tower lasers and the boss aura.
- **Night look (bosses, special levels):** the same world at night, with glowing lane edges and glowing
  monsters.
- **Readability comes first.** Effects must never blur the gameplay.
- **All sound is synthesized in code** using the Web Audio API: punchy chiptune effects for every weapon,
  hit, coin, tower and boss, plus three music tracks (menu, battle, boss). There are no audio files,
  so there are no licensing issues.

## Getting started (development)

Requirements: [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/dominikamann/cube-crashers.git
cd cube-crashers
npm install

npm run dev     # run the game in the browser with hot reload (http://localhost:5173)
npm test        # run the test suite (Vitest)
npm run build   # type-check and build to dist/
```

## Project structure

```
cube-crashers/
  src/
    sim/            pure game logic (no graphics, no DOM): state, systems, config tables
      config/       data tables: enemies, weapons, towers, waves, maps
      systems/      player, enemies, waves, weapons, combat, coins, crates, towers, bosses, outcome
      sim.ts        createSim / stepSim: one fixed 60 Hz tick
    render/         Three.js renderer: voxel world, day/night themes, instanced entities, effects
    audio/          synthesized sound effects, chiptune music, mixer
    input/          keyboard → commands
    ui/             HUD, build menu, screens
    i18n/           all player-visible text (English; German planned)
    main.ts         wires everything together, game loop
  electron/         desktop app main process
  tests/            Vitest tests, mirroring src/
  docs/
    superpowers/specs/   design document
    superpowers/plans/   implementation plan
    design/              visual style reference
    ideas.md             ideas for later
```

## Architecture

The most important rule: **game logic and presentation are strictly separated.**

```
 keyboard ──► Command[] ──► stepSim(state, commands)  (60 Hz, deterministic, seeded RNG)
                                  │
                                  ├──► SimState  ──► renderer (reads only)
                                  └──► SimEvent[] ──► renderer effects, sound, HUD
```

- `src/sim/` never imports Three.js or the DOM, and never uses `Math.random` or `Date`.
  A test enforces this.
- The simulation runs at a fixed 60 ticks per second. The client feeds it commands
  (`move`, `build`) and reacts to the events it emits (`enemyKilled`, `coinPicked`, `bossSpawn`, …).
- **Why:** in the LAN version, the host runs the same simulation authoritatively and sends state to
  the other players. No game logic needs to be rewritten for that.
- Balancing lives in plain data tables in `src/sim/config/`.

## Building the desktop app

The game is packaged with Electron (in progress):

```bash
npm run app:dev    # run as a desktop app in development
npm run dist:mac   # build a .dmg for macOS (Apple Silicon + Intel)
npm run dist:win   # build a Windows installer (.exe)
```

Builds are currently **unsigned**:

- **macOS:** the first time, right-click the app → *Open* → *Open*.
- **Windows:** click *More info* → *Run anyway* on the SmartScreen warning.

Code signing can be added later.

## Roadmap

- [x] Design and plan
- [x] Game logic: movement, waves, weapons, coins, crates, towers, player damage, mini-boss,
      Segment Worm, victory and stars (fully tested)
- [ ] Graphics: voxel world, day/night looks, effects *(in progress)*
- [ ] Sound effects and music
- [ ] HUD, build menu, title, pause and result screens
- [ ] Desktop app for Windows and macOS
- [ ] Unlocks: earn stars to unlock weapons, towers and maps
- [ ] **LAN co-op for up to 6 players.** A server is built into every install: one player clicks
      *Host game*, everyone else picks the game from an automatically discovered list. No IP addresses
      and no setup.
- [ ] German translation
- [ ] Ideas for later ([docs/ideas.md](docs/ideas.md)): real-city maps from OpenStreetMap, and a plugin
      system for maps, weapons, towers and game modes

## Contributing

Contributions are welcome once the first playable version is out. Please keep in mind:

- **All assets must be original or freely licensed.** Sounds and music are synthesized in code, and
  graphics are built from voxels in code.
- **No protected characters or brands.** Monsters are original creatures *in the style of* old
  arcade games.
- Game logic belongs in `src/sim/` and must stay pure and deterministic.
- Write tests first (`npm test`) for game logic changes.
- All player-visible text goes through `t()` in `src/i18n/`.

## License

[MIT](LICENSE) © 2026 Dominik Amann
