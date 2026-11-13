# Cube Crashers – Ideas

A place for ideas: new floors, game modes, weapons, towers, monsters, bosses, anything. Nothing here is
planned or promised; it is a pool to pick from. What is planned next is in the README's roadmap.

**Add your own:** open a pull request that adds a line or a short section in the right place below (sign it
with your GitHub name if you like), or open an issue with the label `idea`. Keep each idea short: what it is,
and why it would be fun.

---

## Game modes

### Lane Defense as a full mode
Lane Defense is in the game as a 90-second minigame: one long lane, waves marching toward your arcade cabinet,
build pads along the sides. As a mode of its own it would go on for many waves, with a shop in between.
- To stop "stand still and shoot" from being the best strategy: waves from two ends, a cabinet that has to be
  repaired at the front.
- Lane variants: a **zig-zag lane** (turns force you to move), **two lanes crossing** in the middle,
  a **lane on a conveyor** that slowly moves everything toward you.

### Lane Race (LAN)
Every player gets their own parallel lane with the same waves. Whoever clears faster sends extra monsters
into the other lanes ("garbage" like in puzzle battles). Last one standing wins.

---

## Floors and themes

- **Retro Arcade Hall**: rows of giant cabinets as walls; screens show live attract-mode loops; a pinball
  table floor section with bumpers that bounce players and monsters.
- **Toy Factory**: walls of building blocks; a stamping press that hits a row of tiles on a beat.
- **Frozen Freezer Aisle**: slippery ice floor (you slide when you stop), frozen monsters thaw over time.
- More for the **Server Farm** (it is in the game): cooling fans that push like conveyor belts, a power-down
  that turns the lights off on a timer.
- **Lava Bakery**: hot plates that glow before they burn.
- More for the **Sunken Arcade** (it is in the game): bubbles that lift you over walls, jellyfish monsters.
- **Space Station**: low gravity (longer jumps), airlocks that open on a timer and suck coins out.

---

## Bosses

- **Pinball Wizard**: a huge ball that bounces around the arena; hit the flippers to send it back at its weak spot.
- **Glitch Twins**: two bosses that share one health bar; kill them close together or the other revives.

## Monsters

- **Coin Thief**: grabs coins from the floor and runs; drops them all when killed.

## Weapons and items

- **Pogo Stick**: rare item, bounce stomps for 30 seconds.
- **Remote Kart**: send an empty kart driving into a horde.
- **Cardboard Decoy**: monsters attack it instead of you.

## Towers

- **Coin Fountain**: slowly makes coins, but monsters target it first.

## Vehicles

- **Shopping Trolley**: two players, one pushes, one shoots.
- **Mini Mech**: slow, stomps, can step over low walls.
- A new look for the karts and the unicorn, in the finer voxel style of the monsters.

---

## Multiplayer and couch co-op

- Split screen for 3 and 4 players (2×2).
- Revive mini-game: tap the button in rhythm to help up faster.
- Shared team upgrades in the shop.

## Plugins and mods

Let the community add content without touching the core game:
- Maps, weapons, towers, monsters, bosses, game modes.
- Plugins as folders with a manifest (name, version, author, license) plus data and scripts.
- Weapons, towers, monsters and maps are already data tables (`src/sim/config/`), so a plugin would register
  more entries.
- Open questions: sandboxing plugin scripts, LAN and server sync (everyone needs the same plugins; the host
  could send them on join), a plugin browser.

## Quality of life

- Photo mode.
