import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';
import { onBorder } from '../../src/sim/map/border';
import { Tile, tileAt } from '../../src/sim/map/tilemap';

describe('the Kraken', () => {
  it('climbs over the walls inside the map on its way to the players, but never onto the wall round it', () => {
    const s = createSim(FLOORS.floor01.map, 3, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.nests = [];
    s.boss = null;
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    spawnBoss(s, 'kraken');
    s.boss!.nextAttackAt = 1e9;
    s.players[0].invulnUntil = 1e9;
    const p = s.players[0].pos;
    const walled = (w: { x: number; z: number }) => {
      for (let t = 0.05; t < 1; t += 0.02) if (tileAt(s.map, w.x + (p.x - w.x) * t, w.z + (p.z - w.z) * t) === Tile.Wall) return true;
      return false;
    };
    const start = s.map.waypoints.find(w => Math.hypot(w.x - p.x, w.z - p.z) > 12 && walled(w))!;
    expect(start).toBeTruthy();
    const body = () => s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body().pos = { ...start };
    let onWall = false, best = Infinity;
    for (let i = 0; i < 150 * 60; i++) {
      stepSim(s, []);
      const q = body();
      onWall ||= tileAt(s.map, q.pos.x, q.pos.z) === Tile.Wall;
      best = Math.min(best, Math.hypot(q.pos.x - p.x, q.pos.z - p.z));
      expect(onBorder(s.map, q.pos.x, q.pos.z)).toBe(false);
    }
    expect(onWall).toBe(true);
    expect(best).toBeLessThan(4);
  });
});
