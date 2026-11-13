import { describe, expect, it } from 'vitest';
import { FLOORS, RUN_BOSSES, runBosses, runFloors } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, isFree, Tile, tileAt, type FloorMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { grabPlayer, spawnBoss } from '../../src/sim/systems/boss';
import { enterFloor } from '../../src/sim/systems/run';
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

  it('and its bosses too: the arena has the Mega Block or the Rhino, the roof ends with the worm, King Rex or the Tarantula Queen', () => {
    const mid = new Set<string>(), last = new Set<string>(), pairs = new Set<string>();
    for (let seed = 1; seed < 400; seed++) {
      const floors = runFloors(seed), bosses = runBosses(seed, floors);
      expect(bosses).toHaveLength(floors.length);
      floors.forEach((id, i) => {
        // a boss exactly where the floor is a boss floor, and one that floor can have
        if (FLOORS[id].kind === 'boss') expect(RUN_BOSSES[id]).toContain(bosses[i]);
        else expect(bosses[i]).toBeNull();
      });
      const own = bosses.filter(Boolean);
      expect(new Set(own).size).toBe(own.length);
      expect(own).not.toContain('dominik');
      mid.add(bosses[2]!);
      last.add(bosses[4]!);
      pairs.add(`${bosses[2]}+${bosses[4]}`);
      // under water it is always the Kraken
      if (floors[2] === 'underwater') expect(bosses[2]).toBe('kraken');
    }
    expect([...mid].sort()).toEqual(['kraken', 'megaBlock', 'rhino']);
    expect([...last].sort()).toEqual(['rex', 'spider', 'worm']);
    expect(pairs.size).toBe(9);
    expect(runBosses(7, runFloors(7))).toEqual(runBosses(7, runFloors(7)));
  });

  it('a run meets the bosses its seed picked, and a single floor its own', () => {
    for (const seed of [8, 16, 24, 40]) {
      const s = createSim(FLOORS.floor01.map, seed, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
      expect(s.run.bosses).toEqual(runBosses(seed, s.run.floors));
      enterFloor(s, 2);
      expect(s.boss?.kind).toBe(s.run.bosses![2]);
      enterFloor(s, 4);
      expect(s.boss?.kind).toBe(s.run.bosses![4]);
    }
    expect(createSim(FLOORS.arena.map, 16).boss?.kind).toBe('megaBlock');
    expect(createSim(FLOORS.rooftop.map, 16).boss?.kind).toBe('worm');
  });
});

describe('under water', () => {
  it('the sea is full of fish and sharks from the start, and the Kraken keeps calling new schools', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    s.players[0].invulnUntil = 1e9;
    const sea = () => s.enemies.filter(e => (e.kind === 'fish' || e.kind === 'shark') && e.hp > 0);
    expect(sea().filter(e => e.kind === 'fish').length).toBeGreaterThanOrEqual(15);
    expect(sea().some(e => e.kind === 'shark')).toBe(true);
    for (const e of sea()) e.hp = 0;
    for (let i = 0; i < 30 * 60; i++) stepSim(s, []);
    expect(sea().length).toBeGreaterThanOrEqual(5);
  }, 90_000);

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

  it('a dash breaks its grip only when a dash charge is left', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const k = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    k.speed = 0;
    p.pos = { x: k.pos.x, z: k.pos.z + 7 };
    p.dashCharges = 0;
    p.dashRecharge = 10_000;
    grabPlayer(s, p);
    stepSim(s, [{ type: 'dash', playerId: p.id }]);
    stepSim(s, []);
    expect(s.boss!.grab?.playerId).toBe(p.id);
  });

  it('when the Kraken dies it lets go of the player it holds', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    const p = s.players[0];
    p.invulnUntil = 1e9;
    const k = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    k.speed = 0;
    p.pos = { x: k.pos.x, z: k.pos.z + 7 };
    grabPlayer(s, p);
    k.hp = 0;
    stepSim(s, []);
    expect(s.boss).toBeNull();
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'krakenRelease', playerId: p.id }));
  });

  it('the Kraken lashes out with its tentacles and sends fish and sharks', () => {
    const s = createSim(FLOORS.underwater.map, 3, { mode: 'quick', players: 1 });
    expect(s.boss?.kind).toBe('kraken');
    s.players[0].invulnUntil = 1e9;
    // held in place far from the player: it lashes and inks from afar instead of crawling up to grab
    s.enemies.find(e => e.id === s.boss!.enemyId)!.speed = 0;
    let warned = 0;
    for (let i = 0; i < 20 * 60; i++) {
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
