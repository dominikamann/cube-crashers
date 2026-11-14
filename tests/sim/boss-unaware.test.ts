import { describe, expect, it } from 'vitest';
import { AGGRO_RADIUS } from '../../src/sim/config/balance';
import { FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, hasLos, nearestFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { damageEnemy } from '../../src/sim/systems/combat';
import type { SimState, Vec2 } from '../../src/sim/types';

/** the Mega Block's arena as a Single floor, the player put where the boss cannot see them */
function arena(): SimState {
  const s = createSim(FLOORS.arena.map, 4, { mode: 'quick', players: 1 });
  const body = bodyOf(s);
  const hidden = s.map.waypoints
    .filter(w => Math.hypot(w.x - body.pos.x, w.z - body.pos.z) > AGGRO_RADIUS + 4)
    .sort((a, b) => Math.hypot(b.x - body.pos.x, b.z - body.pos.z) - Math.hypot(a.x - body.pos.x, a.z - body.pos.z))[0];
  s.players[0].pos = nearestFree(s.map, hidden, 0.4, BLOCKS_WALKER);
  s.crates = [];
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;
/** steps the sim, the player standing still where they are (out of the boss's way), and the boss's attacks seen meanwhile */
const run = (s: SimState, ticks: number, at?: Vec2) => {
  let attacks = 0;
  for (let i = 0; i < ticks; i++) {
    if (at) s.players[0].pos = { ...at };
    stepSim(s, []);
    attacks += s.events.filter(e => e.type === 'bossAttack' || e.type === 'blastWarning').length;
  }
  return attacks;
};

describe('a boss that has not seen anyone yet', () => {
  it('wanders about like a horde and attacks nobody', () => {
    const s = arena();
    const body = bodyOf(s), start = { ...body.pos }, me = { ...s.players[0].pos };
    let moved = 0;
    for (let i = 0; i < 8; i++) {
      // (the player keeps out of its sight: wherever it goes, they stay on the far side)
      if (hasLos(s.map, body.pos, me) && Math.hypot(me.x - body.pos.x, me.z - body.pos.z) <= AGGRO_RADIUS) break;
      expect(run(s, 60, me)).toBe(0);
      moved = Math.max(moved, Math.hypot(body.pos.x - start.x, body.pos.z - start.z));
    }
    expect(moved).toBeGreaterThan(1);
    expect(s.players[0].hp).toBe(s.players[0].maxHp);
  });

  it('goes for a player once it sees them', () => {
    const s = arena();
    const body = bodyOf(s);
    s.players[0].pos = nearestFree(s.map, { x: body.pos.x + 5, z: body.pos.z }, 0.4, BLOCKS_WALKER);
    expect(run(s, 6 * 60)).toBeGreaterThan(0);
  });

  it('wakes when it is hurt, even by someone it has not seen', () => {
    const s = arena();
    const me = { ...s.players[0].pos };
    damageEnemy(s, bodyOf(s), 5, 'pixelBlaster', 0);
    expect(run(s, 6 * 60, me)).toBeGreaterThan(0);
  });
});

describe('what the review found', () => {
  it('from inside a wall the nearest free spot is still found (no sight needed from in there)', async () => {
    const { nearestFloor, isFree, BLOCKS_ENEMY, Tile } = await import('../../src/sim/map/tilemap');
    const m = FLOORS.arena.map;
    const wall = m.tiles.findIndex((t, i) => t === Tile.Wall && m.tiles[i + 2 * m.w] === Tile.Floor && m.tiles[i + m.w] === Tile.Wall && i % m.w > 3 && i % m.w < m.w - 3);
    const inWall = { x: (wall % m.w) + 0.5, z: Math.floor(wall / m.w) + 0.5 };
    expect(isFree(m, inWall, 0.3, BLOCKS_ENEMY)).toBe(false);
    expect(isFree(m, nearestFloor(m, inWall, 0.4, BLOCKS_ENEMY), 0.4, BLOCKS_ENEMY)).toBe(true);
  });

  it('the climbers see over the walls they climb', async () => {
    const { seenBy, spawnBoss } = await import('../../src/sim/systems/boss');
    const s = createSim(FLOORS.arena.map, 4, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    spawnBoss(s, 'spider');
    const queen = bodyOf(s);
    // (on a wall, the player 10 tiles off behind it)
    const m = s.map, wall = m.tiles.findIndex((t, i) => t === 1 && i % m.w > 5 && i % m.w < m.w - 5 && Math.floor(i / m.w) > 3);
    queen.pos = { x: (wall % m.w) + 0.5, z: Math.floor(wall / m.w) + 0.5 };
    s.players[0].pos = nearestFree(m, { x: queen.pos.x, z: queen.pos.z + 10 }, 0.4, BLOCKS_WALKER);
    expect(seenBy(s, s.boss!).length).toBe(1);
  });

  it('as many little Schrättele as the hordes grow, each on her own', async () => {
    const { hordeScale } = await import('../../src/sim/systems/coop');
    const { TOWN_WITCHLINGS } = await import('../../src/sim/systems/witch');
    for (const [players, difficulty] of [[1, 'medium'], [1, 'high'], [2, 'medium']] as const) {
      const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick', players, difficulty });
      const out = s.enemies.filter(e => e.kind === 'witchling' && e.hordeId !== null);
      expect(out.length, `${players} on ${difficulty}`).toBe(Math.round(TOWN_WITCHLINGS * hordeScale(s)));
      expect(new Set(out.map(e => e.hordeId)).size).toBe(out.length);
    }
  });
});
