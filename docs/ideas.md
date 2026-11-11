# Cube Crashers – Ideas

Ideas for after Phase 1 (single player) and Phase 2 (LAN co-op). Not planned yet.

## Real-city maps via OpenStreetMap

- Maps based on real places: play in your own city centre, your street, your town square.
- Import an area from OpenStreetMap (streets, buildings, parks, water) and turn it into a voxel map:
  streets become lanes, buildings become voxel blocks, squares and parks become build pad areas.
- Pick an area in-game (search a place / drag a box on a map), generate the level, save and share it.
- Needs: OSM data download (Overpass API or exported `.osm`/`.pbf` file), lane/path generation from the
  street graph, automatic build pad placement, voxelization of building footprints with heights.
- Licensing: OSM data is ODbL – show "© OpenStreetMap contributors" attribution in the game and on shared maps.

## Plugins / mods

Let the community add content without touching the core game:

- **Maps** (incl. OSM-generated ones)
- **Weapons**
- **Towers**
- **Enemies and bosses**
- **Game modes**
- Plugins as folders with a manifest (name, version, author, license) plus data and scripts.
- Fits the current architecture: weapons, towers, enemies, waves and maps are already data tables
  (`src/sim/config/*`) – a plugin system would register additional entries.
- Open questions: sandboxing of plugin scripts, LAN sync (all players need the same plugins –
  host could send them on join), plugin browser/sharing.

## Game modes

- "Cube Crashers" night mode / special levels in the A2 neon look.
- "Coin-Op Chaos" as a possible mode name.
