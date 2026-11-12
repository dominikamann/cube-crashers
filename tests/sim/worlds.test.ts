import { describe, expect, it } from 'vitest';
import { FLOORS, runFloors } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, isFree, Tile, tileAt, type FloorMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { grabPlayer, spawnBoss } from '../../src/sim/systems/boss';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Vec2 } from '../../src/sim/types';
import { quietSim, rel } from './helpers';

/** every tile a walker can reach from the spawn */
function reachable(m: FloorMap): Set<number> {
  const seen = new Set<number>();
  const start = Math.floor(m.spawn.z) * m.w + Math.floor(m.spawn.x);
  const queue = [start];
  seen.add(start);
  while (queue.length) {
    const i = queue.pop()!;
    const tx = i % m.w, tz = (i - tx) / m.w;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, z = tz + oz, j = z * m.w + x;
      if (seen.has(j) || !isFree(m, { x: x + 0.5, z: z + 0.5 }, 0.4, BLOCKS_WALKER)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}
const at = (m: FloorMap, p: Vec2) => Math.floor(p.z) * m.w + Math.floor(p.x);

describe('the new worlds', () => {
  it('Pixel Jungle and Server Farm are nest floors, the Sunken Arcade is the Kraken\'s', () => {
    expect(FLOORS.jungle.kind).toBe('nests');
    expect(FLOORS.servers.kind).toBe('nests');
    expect(FLOORS.underwater.kind).toBe('boss');
    expect(FLOORS.underwater.boss).toBe('kraken');
  });

  for (const id of ['jungle', 'servers', 'underwater']) {
    it(`${id}: the elevator, every nest, pad, crate and vehicle spot can be walked to from the spawn`, () => {
      const m = FLOORS[id].map;
      const ok = reachable(m);
      for (const p of [m.elevator, ...m.nestSpots.map(n => n.pos), ...m.pads.map(p => p.pos), ...m.crateSpots, ...m.vehicleSpots]) expect(ok.has(at(m, p)), `${p.x},${p.z}`).toBe(true);
    });
  }

  it('the jungle has tall grass to hide in, on plain floor', () => {
    const m = FLOORS.jungle.map;
    expect(m.grass!.length).toBeGreaterThan(100);
    for (const g of m.grass!) expect(tileAt(m, g.x, g.z)).toBe(Tile.Floor);
  });

  it('a Tower Run picks each world from its choices by the seed: every run a little different', () => {
    const seen = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    for (let seed = 1; seed < 60; seed++) runFloors(seed).forEach((f, i) => seen[i].add(f));
    expect([...seen[0]]).toEqual(['floor01']);
    expect([...seen[1]].sort()).toEqual(['candy', 'jungle']);
    expect([...seen[2]].sort()).toEqual(['arena', 'underwater']);
    expect([...seen[3]].sort()).toEqual(['highway', 'neon', 'servers']);
    expect([...seen[4]]).toEqual(['rooftop']);
    expect(runFloors(7)).toEqual(runFloors(7));
  });
});

describe('under water', () => {
  it('the Kraken crawls toward the players', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const k = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    const start = Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z);
    for (let i = 0; i < 5 * 60; i++) stepSim(s, []);
    expect(Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z)).toBeLessThan(start - 1.5);
  });

  it('it grabs a player with a tentacle and drags them in, and a dash breaks free', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const k = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    k.speed = 0;
    p.pos = { x: k.pos.x, z: k.pos.z + 7 };
    grabPlayer(s, p);
    expect(s.boss!.grab?.playerId).toBe(p.id);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'krakenGrab', playerId: p.id }));
    const before = Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z);
    for (let i = 0; i < 30; i++) stepSim(s, []);
    expect(Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z)).toBeLessThan(before - 1);
    stepSim(s, [{ type: 'dash', playerId: p.id }]);
    stepSim(s, []);
    expect(s.boss!.grab).toBeFalsy();
  });

  it('the Kraken lashes out with its tentacles and sends fish and sharks', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    expect(s.boss?.kind).toBe('kraken');
    s.players[0].invulnUntil = 1e9;
    let warned = 0;
    for (let i = 0; i < 8 * 60; i++) {
      stepSim(s, []);
      warned += s.events.filter(e => e.type === 'blastWarning').length;
    }
    expect(warned).toBeGreaterThan(4);
    const kraken = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    kraken.hp = kraken.maxHp * 0.5;
    stepSim(s, []);
    expect(s.enemies.some(e => e.kind === 'fish' || e.kind === 'shark')).toBe(true);
  });

  it('a shark lunges at you after a warning', () => {
    const s = quietSim();
    const p = s.players[0];
    const e = spawnEnemy(s, 'shark', rel(p.pos, 0, -5));
    let warned = false;
    const hp = p.hp;
    for (let i = 0; i < 200 && p.hp === hp; i++) {
      stepSim(s, []);
      warned ||= s.events.some(ev => ev.type === 'enemyWindup' && ev.kind === 'shark');
    }
    expect(warned).toBe(true);
    expect(p.hp).toBeLessThan(hp);
    void e;
  });

  it('a school of fish comes at you fast', () => {
    const s = quietSim();
    const p = s.players[0];
    const e = spawnEnemy(s, 'fish', rel(p.pos, 0, -6));
    expect(e.speed).toBeGreaterThan(3);
    void spawnBoss;
  });
});
