# Cube Crashers – Ideas

A place for ideas: new floors, game modes, weapons, towers, monsters, bosses, anything. Nothing here is
planned or promised; it is a pool to pick from.

**Add your own:** open a pull request that adds a line or a short section in the right place below (sign it
with your GitHub name if you like), or open an issue with the label `idea`. Keep each idea short: what it is,
and why it would be fun.

---

## Game modes

### Lane Defense (the classic)
Where Cube Crashers started: one long lane, waves of monsters marching toward your arcade cabinet, build pads
along the sides. Comes back as its own mode next to Tower Run and Endless.
- To stop "stand still and shoot" from being the best strategy: power-ups that only spawn far up the lane,
  waves from two ends, a cabinet that has to be repaired at the front.
- Lane variants: a **zig-zag lane** (turns force you to move), **two lanes crossing** in the middle,
  a **lane on a conveyor** that slowly moves everything toward you.

### Lane Runner (auto-scroller)
The camera scrolls forward on its own along a long lane; you dodge, shoot and collect. Barriers, ramps and
glitch floor come at you. Hordes come from the front and sometimes from behind. Like a shoot-'em-up, but on
foot or in a kart.

### Lane Race (LAN)
Every player gets their own parallel lane with the same waves. Whoever clears faster sends extra monsters
into the other lanes ("garbage" like in puzzle battles). Last one standing wins.

### Survival Siege
One big arena, no nests: survive 10 minutes against ever bigger waves. Every minute an elevator brings a shop.

### King of the Zone
LAN versus mode: one hold zone in the middle of the map moves every 60 seconds. Teams of players score while
standing in it; monsters attack everyone.

### Boss Rush
All bosses one after another, with a shop between each. Separate high score list.

### Daily Run
One seed per day for everyone: same map, same crates, same rare weapons. Compare scores with friends.

### Coin-Op Chaos
Fast arcade mode: every 30 seconds a random rule changes (low gravity, double speed, only swords, everything
explodes, ...).

---

## Floors and themes

- **Retro Arcade Hall**: rows of giant cabinets as walls; screens show live attract-mode loops; a pinball
  table floor section with bumpers that bounce players and monsters.
- **Toy Factory**: building blocks as walls that monsters can knock over; a stamping press that hits a row of
  tiles on a beat.
- **Frozen Freezer Aisle**: slippery ice floor (you slide when you stop), frozen monsters thaw over time.
- **Pixel Jungle**: tall grass hides monsters until they are close; vines block paths and can be cut with the
  Laser Sword.
- **Server Farm**: rows of server racks, cooling fans that push like conveyor belts, a power-down that turns
  the lights off on a timer.
- **Lava Bakery**: hot plates that glow before they burn; giant donut rings as ramps.
- **Underwater Arcade**: slow movement, bubbles lift you over walls, jellyfish monsters.
- **Space Station**: low gravity (longer jumps), airlocks that open on a timer and suck coins out.
- **Night Market**: food stalls as cover, lanterns that light up when you pass.
- **City from OpenStreetMap**: see below.

## Real-city maps via OpenStreetMap
Play in your own street or town centre:
- Import an area from OpenStreetMap (streets, buildings, parks, water) and turn it into a voxel map:
  streets become paths, buildings become blocks with their real height, squares and parks get build pads.
- Pick the area in the game (search a place or drag a box), generate the floor, save and share it.
- Needs: OSM data (Overpass API or an exported file), path generation from the street graph, automatic pad and
  nest placement.
- OSM data is ODbL: show "© OpenStreetMap contributors" in the game and on shared maps.

---

## Bosses

- **Claw Machine**: a giant grabber arm reaches down at telegraphed spots and carries players off to the edge
  of the map.
- **Pinball Wizard**: a huge ball that bounces around the arena; hit the flippers to send it back at its weak spot.
- **Glitch Twins**: two bosses that share one health bar; kill them close together or the other revives.
- **The Cartridge**: a giant game cartridge that "loads" other floors' layouts into the arena, phase by phase.
- **Mega Hop Blob**: splits into more and smaller blobs every time it is hit hard.

## Monsters

- **Shielder**: carries a shield on one side; hit it from behind or let a mortar lob over it.
- **Healer**: heals monsters around it; glows green.
- **Coin Thief**: grabs coins from the floor and runs; drops them all when killed.
- **Teleporter**: blinks next to you after a short shimmer.
- **Builder**: places small walls that change the paths of the horde.
- **Glitch Ghost**: walks through walls, only visible when close or in a frost field.

## Weapons and items

- **Yo-yo Launcher**: throws and pulls back, hits twice.
- **Bubble Wand**: traps a monster in a bubble that floats away.
- **Pogo Stick**: rare item, bounce stomps for 30 seconds.
- **Magnet Glove**: pulls monsters together for a bomb.
- **Remote Kart**: send an empty kart driving into a horde.
- **Cardboard Decoy**: monsters attack it instead of you.

## Towers

- **Bumper**: knocks monsters back like a pinball bumper.
- **Coin Fountain**: slowly makes coins, but monsters target it first.
- **Tesla Coil**: chain lightning between monsters close together.
- **Turret Kart Garage**: repairs karts parked next to it.
- **Wall Builder**: puts up a temporary low wall across a path.

## Vehicles

- **Bumper Car**: bounces off walls, great for ramming.
- **Shopping Trolley**: two players, one pushes, one shoots.
- **Mini Mech**: slow, stomps, can step over low walls.

---

## Multiplayer and couch co-op

- Split screen for 3 and 4 players (2×2).
- Online play through a relay, not only on the LAN.
- Emotes and pings ("help!", "nest here", "need coins").
- Revive mini-game: tap the button in rhythm to help up faster.
- Shared team upgrades in the shop.

## Plugins and mods

Let the community add content without touching the core game:
- Maps (including OSM-generated ones), weapons, towers, monsters, bosses, game modes.
- Plugins as folders with a manifest (name, version, author, license) plus data and scripts.
- Weapons, towers, monsters and maps are already data tables (`src/sim/config/`), so a plugin would register
  more entries.
- Open questions: sandboxing plugin scripts, LAN sync (everyone needs the same plugins; the host could send
  them on join), a plugin browser.

## Quality of life

- Key and button rebinding.
- German translation (and more languages).
- Colour-blind friendly palette for nests, glitch floor and enemy shots.
- Replays of the last minute (from the deterministic simulation).
- Photo mode.
