# Cube Crashers

**A fast voxel action game for one to six players.** Fight your way up a tower, floor by floor. Hordes of
retro arcade monsters roam a big voxel map and hunt you down. Blow up their glitch nests, hold the zone while
the horde storms in, build towers at the chokepoints, stomp, dash, fly a jetpack over the walls, or grab a
Crash Kart and plough through the pixels. Play alone or with up to five friends on your LAN.

![Gameplay: holding a nest zone on the Arcade Plaza](docs/design/gameplay.gif)

<table>
  <tr>
    <td><img src="docs/design/candy.gif" alt="Candy Factory with conveyor belts" /></td>
    <td><img src="docs/design/arena.gif" alt="Boss fight against the Mega Block" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Candy Factory: conveyor belts push everyone around</sub></td>
    <td align="center"><sub>Mega Block Arena: the first boss</sub></td>
  </tr>
  <tr>
    <td><img src="docs/design/neon.gif" alt="Neon City at night" /></td>
    <td><img src="docs/design/rooftop.gif" alt="Boss fight against the Segment Worm on the rooftop" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Neon City: always night, more elites</sub></td>
    <td align="center"><sub>Rooftop: the Segment Worm splits when you hit its middle</sub></td>
  </tr>
</table>

Runs on **Windows and macOS**. Free and open source (MIT).

---

## Contents

- [Download and install](#download-and-install)
- [How to play](#how-to-play)
- [The run: five floors, shaft ride, shop, bosses](#the-run-five-floors-shaft-ride-shop-bosses)
- [Unlocks and endless mode](#unlocks-and-endless-mode)
- [Settings and graphics](#settings-and-graphics)
- [Playing together on the LAN](#playing-together-on-the-lan)
- [Controls](#controls)
- [Weapons, rare weapons, jetpack, perks, towers, kart, power-ups](#weapons-rare-weapons-jetpack-perks-towers-kart-power-ups)
- [Monsters](#monsters)
- [Difficulty](#difficulty)
- [Run logs](#run-logs)
- [Development](#development)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Download and install

Get the latest version from the **[Releases page](https://github.com/dominikamann/cube-crashers/releases/latest)**.

### macOS

1. Download the `.dmg` that matches your Mac:
   - Apple Silicon (M1, M2, M3, M4 …): `CubeCrashers-<version>-mac-arm64.dmg`
   - Intel Mac: `CubeCrashers-<version>-mac-x64.dmg`
2. Open the `.dmg` and drag **Cube Crashers** into **Applications**.
3. The app is not signed yet, so macOS blocks it the first time. In **Applications**, **right-click Cube Crashers
   → Open → Open**. After that it starts normally.
   - If macOS still refuses: *System Settings → Privacy & Security*, scroll down, click **Open Anyway**.

### Windows

1. Download `CubeCrashers-<version>-win-x64.exe`.
2. Run it. Windows SmartScreen warns about an unknown publisher because the installer is not signed yet:
   click **More info → Run anyway**.
3. Choose the install folder and finish the setup. Start the game from the Start menu or the desktop.
4. **For LAN games:** when Windows asks whether Cube Crashers may use the network, allow it for **private
   networks**.

### Updates

The app checks GitHub for a new release when it starts (and every few hours).
- **Windows:** the update downloads in the background; a banner offers **Restart now**, otherwise it is
  installed the next time you quit.
- **macOS:** as long as the app is not signed, macOS does not let it replace itself; the banner then shows a
  **Download** button that opens the release page. Signed builds update like on Windows.

### From the source code

See [Development](#development). You need Node.js 20 or newer.

---

## How to play

1. Start the game, pick a mode under **Play** and click it:
   - **Tower Run**: the full game over five floors.
   - **Single floor**: just the Arcade Plaza, a short game.
   - **Endless**: once unlocked (see [Unlocks](#unlocks-and-endless-mode)).

   Set the **difficulty** with the arrows below.
2. You start next to the elevator at the bottom of the map. The **minimap** (bottom right) shows the
   **glitch nests** (big pulsing pink squares), karts (yellow), power-ups (white), crates (purple) and the
   elevator. Arrows at the screen edge point to the nearest nests, and each nest has a pink light beam.
3. **Destroy every nest:**
   - Walk up to a nest and **hold E for one second** to plant a charge (a bar shows the progress). The nest
     turns red and starts shaking.
   - Now **hold the zone** for 25 seconds: the floor tiles around the nest, framed in pink. They light up
     one by one as you hold it. Hordes storm in from the approaches, so build **towers** on the pads nearby.
   - The nest fights back: a red ring marks where it will blast next, right under your feet. **Keep moving.**
   - If you leave the zone, the counter slowly runs back, but the charge stays.
4. When all nests are gone the **elevator opens**. Step in to clear the floor and ride up to the next one.

**Things to know:**
- You have **3 credits** (depends on the difficulty). Going down costs one; you get back up at the last safe
  spot. Out of credits = game over.
- The **alarm** (top centre) rises every 40 seconds and sends hordes after you. At alarm 5 the lights go out.
  Destroying a nest lowers it.
- **Coins** drop from monsters and vanish after 8 seconds. Spend them on towers, upgrades and in the shop.
- **Yellow-black barriers** stop you on foot: **jump** over them (Space). The orange **ramps** in front of them
  launch a kart over.
- **Glitch floor** (purple, with a crossed-out monster) stops monsters but hurts you. Jump over it.
- **Boost pads** (blue with a lightning bolt) make karts faster.
- **Combo:** keep killing without a 3-second break. The multiplier (up to ×10) boosts coins and score.
- **Crates** open into three cards: pick a new weapon, a weapon level-up or a perk by walking into it. Very
  rarely a **golden card** gives you a rare weapon for 60 seconds.

---

## The run: five floors, shaft ride, shop, bosses

| Floor | Theme | What happens |
|---|---|---|
| 1 | Arcade Plaza | Nests, daylight |
| 2 | Candy Factory | Nests; **conveyor belts** push players and monsters |
| 3 | Mega Block Arena | **Boss: Mega Block** |
| 4 | Neon City | Nests; permanent night, more elites |
| 5 | Rooftop | **Boss: Segment Worm** |

- **Shaft ride:** between floors you stand on the elevator platform for 45 seconds while flying **glitch
  swarmers** attack from every side. Keep shooting.
- **Elevator shop:** then the elevator stops. Everyone gets four offers: a weapon level-up, a perk, a full heal,
  or +1 credit for the team (expensive, once per shop). Buy with **1–4** or a click, press **Enter** when you
  are ready. The shop closes after 25 seconds or when everyone is ready.
- **Mega Block:** a huge armoured block with three phases. It stomps (red rings), sends shockwaves along lines
  and calls reinforcements. Get out of the marked areas.
- **Segment Worm:** a long worm of segments. Shoot it in the middle and it splits into two worms (up to four).
  Its strikes are marked on the ground first.
- Weapons, perks, coins and credits come with you to the next floor. Towers, karts, monsters and the alarm start
  fresh. Beat the Segment Worm and take the last elevator to win the run.

---

## Unlocks and endless mode

After every run you earn **tickets** (from your score, the floors you cleared and the difficulty). Spend them
under **Unlocks** on the title screen:

| Unlock | What it is |
|---|---|
| Joystick Boomerang, Disco Ball, Banana Mine, Party Bomb | Weapons that are locked at the start and then show up in crates |
| **Steamroller** | Slow, very tough, crushes everything it touches; no ramp jumps |
| **Hoverboard** | Fast, floats over glitch floor and low walls, fragile, does not ram |
| **Endless mode** | Arcade Plaza without an end: destroyed nests come back elsewhere after 60 seconds and the alarm keeps climbing. Own high score list. |

Progress is saved on your computer. On the LAN, everything any player in the lobby has unlocked is available to
the whole team.

---

## Settings and graphics

- **Graphics quality:** Low, Medium, High (default) or Ultra. Higher levels use sharper shadows, smoothing,
  glow, colour grading and (Ultra) ambient occlusion. Pick Low on older laptops.
- **Damage numbers:** floating numbers when you hit something (can be switched off).
- **Suit colour:** pick one of six colours or *automatic*. On the LAN you get it if nobody else has it.
- **Your name**, sound and music volume, and whether `W` walks toward the crosshair.
- **Controls** are listed at the bottom of the settings screen.
- **Credits** (title screen): who made the game.

---

## Playing together on the LAN

Up to **6 players** on the same network (Wi-Fi or cable), all with the desktop app.

**One player hosts:**
1. *Settings → Your name*: enter a name (it is shown to the others).
2. Click **LAN game → Host LAN game**. Your game shows up on the network automatically.
3. Pick the **difficulty** in the lobby, wait for your friends, click **Start**.

**Everyone else joins:**
1. Enter a name in *Settings* as well.
2. Click **LAN game → Join LAN game**. Games on your network appear in a list after a moment; click one.
3. If no game shows up (some routers block it), type the host's address into the field, e.g. `192.168.1.20`.
   The host finds it in the system network settings.

**In the game:**
- Every player has their own **suit colour**, weapons, perks and coins. **Credits belong to the team.**
- When a teammate goes down, they lie on the floor for **8 seconds**. Stand next to them and **hold E** to help
  them up: no credit lost. If nobody makes it in time, the team loses a credit.
- Hordes grow with the number of players. Split up and hold several nests at once.
- After the run a **ranking** shows who crashed the most cubes, the best combo, and who helped others up most.

Technical details: the host's game runs the match and sends the state to everyone 30 times per second over
TCP port **47800**; games are announced via UDP broadcast on port **47801**. Only the local network is used.

---

## Controls

| Input | Action |
|---|---|
| Mouse | Aim (crosshair on the ground) |
| Left mouse button (hold) | Fire the selected weapon |
| `W` `A` `S` `D` / arrow keys | Move. On foot, `W` walks toward the crosshair (switch off in *Settings*). In the kart the keys steer by the screen. |
| `1`–`6` / mouse wheel | Select a weapon |
| `Q` | Select the rare weapon (when you have one) |
| `Space` | Jump over barriers and glitch floor; landing **stomps** everything around you. **Hold** to fly when you carry a jetpack. |
| `Shift` | **Dash**: short, invulnerable, damages what you pass |
| `E` (tap) | Get in / out of a kart |
| `E` (hold) | Plant a charge · help a teammate up · build, finish, repair or upgrade a tower (menu: `1`–`3`) |
| `1`–`4`, `Enter` | In the elevator shop: buy an offer, say you are ready |
| `Esc` / `P` | Menu (pauses when playing alone) |
| `Z` | Zoom out / in |
| `F11` | Fullscreen (desktop app) |

### Controller (Xbox and other standard pads)

Connect it and press any button; it takes over as soon as you touch it. It also works in the menus (d-pad or
stick to choose, **A** to confirm, **B** to go back).

| Button | Action |
|---|---|
| Left stick | Move |
| Right stick | Aim; the view slides ahead the further you push (all the way also fires) |
| `R3` (press the right stick) | Zoom out / in |
| `RT` | Fire |
| `A` | Jump; hold to fly with a jetpack |
| `B` | Dash · close the build menu |
| `X` | Like `E`: tap for the kart, hold to plant, build, repair, help up |
| `Y` | Rare weapon |
| `LB` / `RB` | Previous / next weapon |
| D-pad | Build menu: ◀ Laser, ▲ Popcorn, ▶ Frost (or the upgrade) · shop: buy offers 1–4 |
| `Start` | Pause |

### Split screen (two players on one computer)

On the title screen choose **2 players · split screen**. With one controller, player 1 plays with keyboard and
mouse and player 2 with the controller. With two controllers each player has one. Each half has its own
camera, HUD and crosshair in the player's suit colour.

Every weapon **reloads on its own, also when it is not selected**. The weapon bar shows each reload and
glows when a weapon is ready, so you can switch through and fire whatever is loaded.

---

## Weapons, rare weapons, jetpack, perks, towers, kart, power-ups

### Weapons (up to 6, each up to level 5)

| Weapon | What it does |
|---|---|
| **Pixel Blaster** | Starter weapon. Fast bolts; more bolts at higher levels. |
| **Laser Sword** | Wide swing toward the crosshair. |
| **Candy Cannon** | Spread of candy pellets. |
| **Hotdog Slinger** | Lobs a hotdog to the crosshair; the mustard puddle keeps hurting. |
| **Joystick Boomerang** | Flies out and back, hitting everything twice. |
| **Disco Ball** | Zaps the nearest monsters around you. |
| **Banana Mine** | Drops a mine that blows up when a monster steps on it. |
| **Party Bomb** | Lobs a big bomb to the crosshair. |

Hits from up close (within 3 tiles) deal **50 % more damage**.

### Rare weapons (golden cards, 60 seconds, key `Q`)

| Rare weapon | What it does |
|---|---|
| **Slush Machine** | Sprays icy slush. Monsters slow down and then freeze solid; frozen monsters take double damage. |
| **Bubblegum Bazooka** | Traps monsters in a huge gum bubble that pops after 3 seconds. |
| **Leaf Blower 3000** | Blows hordes away and slams them into walls. Blows coins toward you. |
| **Pizza Cutter** | A spinning saw that bounces off walls and cuts through everything. |

### Jetpack

Lies somewhere on the map now and then. Pick it up and **hold Space** to fly over walls, glitch floor and
monsters. The tank lasts about 5 seconds of flight, then it is gone.

### Perks

**Speed**, **Extra Dash**, **Magnet**, **Coin Bonus**, **Regeneration**, **Big Stomp**.

### Towers

Stand on a pad, **hold E**, pick a tower with **1–3**. You pay right away, then a scaffold goes up: keep
**holding E** for about 2.5 seconds until the tower stands. If you let go, it stays half-built and you can
finish it later. A tower only fires once it is finished.

| Tower | Cost | Upgrade to level 2 / 3 | What it does |
|---|---|---|---|
| **Laser Tower** | 40 | 40 / 60 | Fast single-target laser. |
| **Frost Machine** | 50 | 50 / 75 | Slows monsters to half speed. |
| **Popcorn Mortar** | 60 | 60 / 90 | Lobs shells that hit everything in an area. |

- **Upgrade:** hold E on a finished tower and press **1**. Each level gives +50 % damage and health, +1 range
  and fires faster. The upgrade is built like a tower (3 seconds of holding E); the tower keeps firing
  meanwhile. Gold marks on the base show the level.
- **Repair:** hold E on a damaged tower. It heals a quarter of its health per second, for free.

### Crash Kart, Steamroller, Hoverboard

Tap `E` next to a kart to get in. Twice as fast as walking, rams monsters out of the way, keeps your weapons
firing and protects you: hits damage the kart instead of you. Boost pads speed you up, ramps launch you over
low walls. 20 seconds of fuel; comes back 45 seconds after it breaks. Once unlocked, the **Steamroller** and
the **Hoverboard** appear on the map as well (see [Unlocks](#unlocks-and-endless-mode)).

### Power-ups

Every 30 seconds one appears somewhere (shown on the minimap): **Coin Magnet**, **Rapid Fire**,
**Screen Bomb**, **Deep Freeze**, **Heart**.

---

## Monsters

All monsters are original voxel creatures in the style of old arcade games. Every dangerous attack is
announced first.

| Monster | Behaviour | Warning |
|---|---|---|
| **Hop Blob** | The standard horde monster. | – |
| **Hunter** | Fast, goes straight for you. | – |
| **Armor Block** | Slow and very tough. | – |
| **Splitter** | Splits into two small splitlings. | – |
| **Shooter** | Keeps its distance and fires slow red bullets. Jump over them. | Aim line on the ground |
| **Bomber** | Runs at you and blows up. Shoot it first and it explodes among its friends. | Blinking fuse, red ring |
| **Rammer** | Charges in a straight line; stunned when it hits a wall. Step aside. | Red lane on the ground |
| **Glitch Swarmer** | Small and weak, flies over walls during the shaft ride. | – |
| **Mega Block** | Boss of floor 3. | Red rings, marked lines |
| **Segment Worm** | Boss of floor 5. Splits when hit in the middle. | Marked strike areas |
| **Elite** | Any monster, bigger and glowing, five times the health. Drops a crate. | Magenta ring |

---

## Difficulty

Chosen on the title screen (alone) or in the lobby (by the host).

| Level | Monster health | Monster damage | Horde size | Credits | Alarm speed | Points |
|---|---|---|---|---|---|---|
| Ultra Low | ×0.5 | ×0.35 | ×0.5 | 6 | half speed | ×0.5 |
| Low | ×0.75 | ×0.6 | ×0.75 | 4 | slower | ×0.75 |
| Medium | ×1 | ×1 | ×1 | 3 | normal | ×1 |
| High | ×1.25 | ×1.25 | ×1.2 | 3 | faster | ×1.5 |
| Ultra High | ×1.5 | ×1.5 | ×1.4 | 2 | much faster | ×2 |

On **Ultra Low** and **Low** you heal slowly (6 or 3 health per second) after 4 seconds without being hit.
On every level, a crowd of monsters around you hurts less than the sum of its members: the strongest one hits in
full, every further one at 30 %.

The best five scores are kept per difficulty; endless mode has its own list.

---

## Run logs

After every run the game writes a small JSON log (result, score, time, kills by source, best combo, damage,
how much of the time you stood still, and a sample every 10 seconds). It never leaves your computer:

- Desktop app: the `runs/` folder in the app's user data folder.
- Dev server: `logs/run-<time>.json` in the project folder (git-ignored).
- Always: the last 20 runs in the browser's local storage.

---

## Development

```bash
git clone https://github.com/dominikamann/cube-crashers.git
cd cube-crashers
npm install

npm run dev       # the game in the browser with hot reload (http://localhost:5173)
npm test          # the test suite (Vitest), including a bot that plays whole floors
npm run build     # type-check and build to dist/

npm run app:dev   # the desktop app with hot reload
npm run app       # build and run the desktop app
npm run dist:mac  # .dmg files for macOS (Apple Silicon + Intel) into release/
npm run dist:win  # Windows installer (.exe) into release/ (works from macOS too)
npm run icon      # regenerate the pixel-art app icon
```

**Releasing:** bump the version in `package.json`, run `npm run dist:mac` and `npm run dist:win`, then upload
*everything* in `release/` that is a file (`.dmg`, `.zip`, `.exe`, `.blockmap`, `latest.yml`,
`latest-mac.yml`) to a new GitHub release. The `latest*.yml` files are what the installed apps look for.

**Signed macOS builds:** nothing secret is stored in this repository. Once per Mac:
1. Create a *Developer ID Application* certificate (Xcode → Settings → Accounts → your team → Manage
   Certificates → + → Developer ID Application). It is stored in your keychain.
2. Create an app-specific password at appleid.apple.com and store it for notarization in your keychain:
   `xcrun notarytool store-credentials cube-crashers --apple-id <your Apple ID> --team-id <your team ID>`
   (asks for the password).

Then `npm run dist:mac:signed` builds, signs and notarizes the macOS apps.

**Testing LAN play on one computer:** run `npm run dev`, open the game in two browser windows, host in one and
join in the other. The dev server includes a small relay for this. Or start the desktop app twice: one hosts,
the other joins via the list or the address `127.0.0.1`.

Dev shortcuts (append to the URL):

| URL parameter | What it does |
|---|---|
| `?seed=7` | Fixed run layout |
| `?demo=1` | Start with six weapons and 200 coins |
| `?demo=nest&alarm=5` | Start next to a planted nest |
| `?demo=rare&kind=pizzaCutter` | Start with a jetpack and a rare weapon |
| `&bot=1` | The test bot plays (dev server only) |
| `&capture=1` | Time only advances via `window.__advance(ms)` – used to record the GIF |
| `&warp=600` | Fast-forward the simulation (60 = 1 s) |
| `?sound=1` | Soundboard: every sound effect and music track |

## Architecture

```
 keyboard + mouse ──► Command[] ──► stepSim(state, commands)  (60 Hz, deterministic, seeded RNG)
                                          │
                                          ├──► SimState   ──► renderer (reads only), HUD
                                          └──► SimEvent[] ──► effects, sound, HUD, run log
```

- `src/sim/` is pure game logic: no Three.js, no DOM, no `Math.random`, no `Date` (a test enforces this).
  The world is a tile grid parsed from a text map; monsters navigate with a flow field.
- **LAN:** the host runs the simulation; clients send their commands and receive snapshots (`src/net/`). In the
  desktop app the main process runs a WebSocket server and UDP discovery (`electron/lan.cjs`); in the browser a
  dev relay in the Vite server does the same job.
- Balancing lives in data tables in `src/sim/config/`.

```
src/
  sim/        game logic (map/, config/, systems/, sim.ts)
  net/        protocol, snapshots, host/client sessions, transports
  render/     Three.js renderer
  audio/      synthesized sound effects and music
  input/      keyboard and mouse → commands
  ui/         HUD, minimap, menus, lobby
electron/     desktop app: main process, preload, LAN server
dev/          dev server plugins (LAN relay)
tests/        Vitest tests (sim, net, electron, audio, render)
docs/         gameplay GIF and screenshots
```

## Roadmap

- [x] Tower Run: one big floor with nests, hordes, weapons, towers, kart, power-ups, combo, score
- [x] Jetpack and rare weapons
- [x] LAN co-op for up to 6 players with revives and a ranking
- [x] Difficulty levels
- [x] Graphics quality setting (sharper shadows, ambient occlusion)
- [x] A run over 5 floors with different themes, a shaft ride between floors, boss floors
- [x] Unlocks, more vehicles, endless mode
- [x] Controller support and local split screen
- [ ] Key rebinding
- [ ] German translation
- [ ] Later: real-city maps from OpenStreetMap, plugins

## Contributing

Contributions are welcome. Please keep in mind:

- **All assets must be original or freely licensed.** Sounds and music are synthesized in code; graphics are
  built from voxels in code.
- **No protected characters, names or brands.** Monsters are original creatures *in the style of* old
  arcade games.
- Game logic belongs in `src/sim/` and must stay pure and deterministic. Write tests first (`npm test`).
- All player-visible text goes through `t()` in `src/i18n/`.

## Credits

A game by **[amannlabs.eu](https://amannlabs.eu)** – Dominik Amann, with help from hard-working AI helpers.

## License

[MIT](LICENSE) © 2026 Dominik Amann. Third-party assets (the pixel font) are listed in
[LICENSE-ASSETS.md](LICENSE-ASSETS.md).
