import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { betweenOf, floorCleared, INTERMISSIONS, runProgress } from '../../src/sim/systems/run';
import { ladders } from '../../src/sim/map/ladders';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_ENEMY, BLOCKS_WALKER, inSolid, isFree, moveCircle, nearestFree, Tile } from '../../src/sim/map/tilemap';
import { buildFlowField, flowDir } from '../../src/sim/map/flowfield';
import { PLAYER_RADIUS } from '../../src/sim/config/balance';

describe('the games between the floors of a run', () => {
  it('are all different within a run, and not the same from run to run', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const list = betweenOf(seed, 5);
      expect(list).toHaveLength(4);
      expect(new Set(list).size, `seed ${seed}`).toBe(4);
      for (const g of list) expect(INTERMISSIONS).toContain(g);
      orders.add(list.join());
    }
    expect(orders.size).toBeGreaterThan(8);
    expect(betweenOf(7, 5)).toEqual(betweenOf(7, 5));
  });

  it('a run gets its order from its seed, or the one it is given', () => {
    expect(createSim(floor01, 7, { mode: 'run' }).run.between).toEqual(betweenOf(7, 5));
    expect(createSim(floor01, 7, { mode: 'run', between: ['town', 'race', 'lane', 'maze'] }).run.between).toEqual(['town', 'race', 'lane', 'maze']);
  });
});

describe('the Town as the game between two floors', () => {
  const town = () => {
    const s = createSim(floor01, 4, { mode: 'run', between: ['town', 'race', 'lane', 'maze'] });
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    return s;
  };

  it('is a boss fight on its own map, counted as a game in between, not as a floor', () => {
    const s = town();
    expect(s.map.id).toBe('waldsee');
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(0);
    expect(s.boss).not.toBeNull();
    expect(s.nests).toHaveLength(0);
    expect(runProgress(s)).toEqual({ stage: 'between', n: 1, total: 4 });
  });

  it('ends at its elevator once the boss has fallen: the shop opens, and the next floor of the run follows', () => {
    const s = town();
    for (const p of s.players) p.invulnUntil = 1e9;
    for (const e of s.enemies) e.hp = 0;
    for (let i = 0; i < 600 && !s.elevatorOpen; i++) stepSim(s, []);
    expect(s.elevatorOpen).toBe(true);
    for (const p of s.players) p.pos = { ...s.map.elevator };
    stepSim(s, []);
    expect(s.run.stage).toBe('shop');
    expect(s.run.floor).toBe(0);
    s.run.stageUntil = s.tick;
    for (let i = 0; i < 5 && s.run.stage === 'shop'; i++) stepSim(s, []);
    expect(s.run.stage).toBe('floor');
    expect(s.run.floor).toBe(1);
    expect(s.map.id).not.toBe('waldsee');
  });

  it('has no karts, no build pads, no ladders, and one small logo on the floor, plus the AmannLabs shop sign as its egg', () => {
    const m = FLOORS.waldsee.map;
    expect(m.vehicleSpots).toHaveLength(0);
    expect(m.pads).toHaveLength(0);
    expect(ladders(m)).toHaveLength(0);
    expect(logoSpots(m)).toEqual([{ kind: 'floor', tx: 64, tz: 38, w: 4, h: 1 }, { kind: 'wall', tx: 24, tz: 49, w: 4, along: 'x', facing: { x: 0, z: 1 } }]);
  });
});

describe('the lane to the elevator', () => {
  it('has no one-tile nubs, and one can walk from the start to the elevator by steering at rough waypoints', () => {
    const m = FLOORS.waldsee.map;
    const wall = (x: number, z: number) => m.tiles[z * m.w + x] === 1;
    for (let z = 40; z < 56; z++)
      for (let x = 66; x < 90; x++) {
        // (a tile a real house reaches into is the street up to its front, not a nub of the lane)
        if (wall(x, z) || [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]].some(([a, b]) => inSolid(m, x + a, z + b))) continue;
        const n = [wall(x + 1, z), wall(x - 1, z), wall(x, z + 1), wall(x, z - 1)].filter(Boolean).length;
        expect(n, `nub at ${x},${z}`).toBeLessThan(3);
      }
    const s = createSim(m, 4, { mode: 'quick' });
    s.enemies = [];
    s.boss = null;
    s.players[0].invulnUntil = 1e9;
    const route = [[67, 52.5], [75, 50.5], [m.elevator.x, m.elevator.z]];
    let wp = 0;
    for (let t = 0; t < 1500 && wp < route.length; t++) {
      const p = s.players[0].pos, dx = route[wp][0] - p.x, dz = route[wp][1] - p.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { wp++; continue; }
      stepSim(s, [{ type: 'move', playerId: 0, dir: { x: dx / d, z: dz / d } }]);
    }
    expect(wp).toBe(route.length);
  });
});

describe('the real houses of the Town', () => {
  const m = FLOORS.waldsee.map;
  const solids = m.solids!;
  const inside = (outline: number[], x: number, z: number) => {
    let c = false;
    for (let i = 0; i < outline.length; i += 4) {
      const ax = outline[i], az = outline[i + 1], bx = outline[i + 2], bz = outline[i + 3];
      if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) c = !c;
    }
    return c;
  };
  const toLine = (px: number, pz: number, x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2));
    return Math.hypot(px - x0 - dx * u, pz - z0 - dz * u);
  };
  const nearestFront = (x: number, z: number) => {
    let d = Infinity;
    for (const s of solids) for (let i = 0; i < s.length; i += 4) d = Math.min(d, toLine(x, z, s[i], s[i + 1], s[i + 2], s[i + 3]));
    return d;
  };

  it('are there, with closed outlines', () => {
    expect(solids.length).toBeGreaterThan(100);
    for (const s of solids) {
      const ends = new Map<string, number>();
      for (let i = 0; i < s.length; i += 2) ends.set(`${s[i]},${s[i + 1]}`, (ends.get(`${s[i]},${s[i + 1]}`) ?? 0) + 1);
      for (const n of ends.values()) expect(n % 2).toBe(0);
    }
  });

  it('can never be entered: no spot inside any of them is free, not even for a point', () => {
    let n = 0;
    for (const s of solids) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < s.length; i += 2) ((x0 = Math.min(x0, s[i])), (x1 = Math.max(x1, s[i])), (z0 = Math.min(z0, s[i + 1])), (z1 = Math.max(z1, s[i + 1])));
      for (let z = Math.max(0, z0) + 0.125; z < Math.min(m.h, z1); z += 0.25)
        for (let x = Math.max(0, x0) + 0.125; x < Math.min(m.w, x1); x += 0.25) {
          if (!inside(s, x, z)) continue;
          n++;
          expect(isFree(m, { x, z }, 0.01, BLOCKS_WALKER), `free inside a house at ${x},${z}`).toBe(false);
          expect(isFree(m, { x, z }, 0.3, BLOCKS_ENEMY), `free for a monster inside a house at ${x},${z}`).toBe(false);
        }
    }
    expect(n).toBeGreaterThan(5000);
  });

  it('let one stand right at every front that faces the street, slanted or not (within 0.45 of the wall)', () => {
    const r = PLAYER_RADIUS;
    let tested = 0;
    for (const s of solids)
      for (let i = 0; i < s.length; i += 4) {
        const x0 = s[i], z0 = s[i + 1], x1 = s[i + 2], z1 = s[i + 3], L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 0.5) continue;
        for (let t = 0.25; t < L; t += 0.5) {
          const px = x0 + ((x1 - x0) * t) / L, pz = z0 + ((z1 - z0) * t) / L;
          // (the side out of the house)
          let nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
          if (inside(s, px + nx * 0.05, pz + nz * 0.05)) ((nx = -nx), (nz = -nz));
          const q = { x: px + nx * (r + 0.05), z: pz + nz * (r + 0.05) };
          // (only where the street is: no wall tile and no other house within reach of the player standing there)
          let street = true;
          for (let tz = Math.floor(q.z - r); tz <= Math.floor(q.z + r) && street; tz++)
            for (let tx = Math.floor(q.x - r); tx <= Math.floor(q.x + r); tx++) {
              const cx = Math.max(tx, Math.min(q.x, tx + 1)), cz = Math.max(tz, Math.min(q.z, tz + 1));
              if (Math.hypot(q.x - cx, q.z - cz) < r && (tx <= 0 || tz <= 0 || tx >= m.w - 1 || tz >= m.h - 1 || m.tiles[tz * m.w + tx] !== Tile.Floor)) street = false;
            }
          if (!street) continue;
          // (and no other wall within reach: not at a corner, not before a neighbouring house)
          for (const o of solids) for (let j = 0; j < o.length; j += 4) if ((o !== s || j !== i) && toLine(q.x, q.z, o[j], o[j + 1], o[j + 2], o[j + 3]) < r + 0.01) street = false;
          if (!street) continue;
          tested++;
          expect(isFree(m, q, r, BLOCKS_WALKER), `cannot stand before the front at ${px.toFixed(2)},${pz.toFixed(2)}`).toBe(true);
        }
      }
    expect(tested).toBeGreaterThan(400);
  });

  it('are never overlapped by a player who walks about for a long while', () => {
    const s = createSim(m, 4, { mode: 'quick' });
    s.enemies = [];
    s.boss = null;
    s.players[0].invulnUntil = 1e9;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let a = 0, close = 0;
    for (let t = 0; t < 6000; t++) {
      if (t % 25 === 0) a = rnd() * Math.PI * 2;
      stepSim(s, [{ type: 'move', playerId: 0, dir: { x: Math.cos(a), z: Math.sin(a) } }]);
      const p = s.players[0].pos;
      expect(inSolid(m, p.x, p.z), `inside a house at tick ${t}`).toBe(false);
      const d = nearestFront(p.x, p.z);
      expect(d, `in a wall at tick ${t}`).toBeGreaterThan(PLAYER_RADIUS - 1e-6);
      if (d < PLAYER_RADIUS + 0.05) close++;
    }
    // (and the walk did bring the player up against the houses)
    expect(close).toBeGreaterThan(10);
  });

  it('leave no monster stranded: wherever one can stand, the flow field leads somewhere', () => {
    const field = buildFlowField(m, [m.spawn], BLOCKS_ENEMY);
    let slivers = 0;
    for (let tz = 1; tz < m.h - 1; tz++)
      for (let tx = 1; tx < m.w - 1; tx++) {
        const i = tz * m.w + tx;
        if (m.tiles[i] !== Tile.Floor || field[i] >= 0) continue;
        const at = nearestFree(m, { x: tx + 0.5, z: tz + 0.5 }, 0.35, BLOCKS_ENEMY);
        if (Math.floor(at.x) !== tx || Math.floor(at.z) !== tz || !isFree(m, at, 0.35, BLOCKS_ENEMY)) continue;
        slivers++;
        // (following the field step by step, it must get out onto a tile the field knows within a few tiles' walk)
        const p = { ...at };
        let out = false;
        for (let k = 0; k < 120 && !out; k++) {
          const dir = flowDir(m, field, p);
          expect(Math.hypot(dir.x, dir.z), `stranded at ${tx},${tz}`).toBeGreaterThan(0.5);
          moveCircle(m, p, dir.x * 0.1, dir.z * 0.1, 0.35, BLOCKS_ENEMY);
          out = field[Math.floor(p.z) * m.w + Math.floor(p.x)] >= 0;
        }
        expect(out, `no way out at ${tx},${tz}`).toBe(true);
      }
    expect(slivers).toBeGreaterThan(0);
  });
});

describe('the barriers of the Town', () => {
  it('have no walkable tile on or behind their line', async () => {
    const { WALDSEE_BARRIERS } = await import('../../src/sim/config/waldsee-town');
    const { floorWaldseeRows } = await import('../../src/sim/config/floor-waldsee');
    for (const b of WALDSEE_BARRIERS)
      for (let z = 0; z < floorWaldseeRows.length; z++)
        for (let x = 0; x < floorWaldseeRows[z].length; x++) {
          if (floorWaldseeRows[z][x] === '#') continue;
          const px = x + 0.5 - b.at[0], pz = z + 0.5 - b.at[1];
          const d = px * b.dir[0] + pz * b.dir[1], l = Math.abs(-px * b.dir[1] + pz * b.dir[0]);
          expect(d > -0.3 && d < 6 && l < b.half, `tile ${x},${z} behind the barrier at ${b.at}`).toBe(false);
        }
  });
});

describe('the Town and the view', () => {
  it('is never a game between the floors, nor Die Hex\'s Boss Rush map, when first person is off', async () => {
    const { BOSS_RUSH } = await import('../../src/sim/config/floors');
    for (let seed = 1; seed <= 60; seed++) {
      expect(createSim(floor01, seed, { mode: 'run', noTown: true }).run.between).not.toContain('town');
    }
    const rush = createSim(floor01, 3, { mode: 'bossrush', noTown: true }).run.floors;
    expect(rush).not.toContain('waldsee');
    expect(rush).toHaveLength(BOSS_RUSH.length);
    // (with first person on, the Town still comes in most runs)
    expect(Array.from({ length: 60 }, (_, i) => createSim(floor01, i + 1, { mode: 'run' }).run.between?.includes('town')).filter(Boolean).length).toBeGreaterThan(30);
  });
});
