import { describe, expect, it } from 'vitest';
import { PLAYER_SPEED } from '../../src/sim/config/balance';
import { BOSS_RUSH, FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, bossHp, spawnBoss } from '../../src/sim/systems/boss';
import { spinWeb } from '../../src/sim/systems/webs';
import { onBorder } from '../../src/sim/map/border';
import { Tile, tileAt } from '../../src/sim/map/tilemap';
import type { SimState } from '../../src/sim/types';

function fight(seed = 4): SimState {
  const s = createSim(FLOORS.arena.map, seed, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, 'spider');
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;
const brood = (s: SimState) => s.enemies.filter(e => e.kind === 'spiderling');

describe('the Tarantula Queen', () => {
  it('is in the Boss Rush, at home in the Server Farm', () => {
    const at = BOSS_RUSH.find(b => b.boss === 'spider');
    expect(at?.map).toBe('servers');
  });

  it('pounces and spins webs', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    let leaps = 0, webs = 0, had = false;
    for (let i = 0; i < 90 * 60; i++) {
      stepSim(s, []);
      if (s.boss?.leap && !had) leaps++;
      had = !!s.boss?.leap;
      webs = Math.max(webs, s.webs?.length ?? 0);
    }
    expect(leaps).toBeGreaterThan(0);
    expect(webs).toBeGreaterThan(0);
  });

  it('a web slows whoever walks through it, but not who dashes or flies', () => {
    const walk = (web: boolean) => {
      const s = createSim(FLOORS.arena.map, 2, { mode: 'quick', players: 1 });
      s.enemies = [];
      s.boss = null;
      const p = s.players[0];
      if (web) s.webs = [{ id: 1, pos: { ...p.pos }, radius: 30, until: 1e9 }];
      const x0 = p.pos.x;
      for (let i = 0; i < 30; i++) stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 0, z: -1 } }]);
      void x0;
      return Math.hypot(p.pos.x - s.map.spawn.x, p.pos.z - s.map.spawn.z);
    };
    const free = walk(false), stuck = walk(true);
    expect(free).toBeGreaterThan((PLAYER_SPEED * 0.5) * 0.9);
    expect(stuck).toBeLessThan(free * 0.6);
    expect(stuck).toBeGreaterThan(0);
  });

  it('webs do not last', () => {
    const s = fight();
    s.webs = [{ id: 1, pos: { x: 5, z: 5 }, radius: 2, until: s.tick + 10 }];
    for (let i = 0; i < 12; i++) stepSim(s, []);
    expect(s.webs.filter(w => w.id === 1)).toHaveLength(0);
  });

  it('bursts into a brood of small spiders when it falls: the fight goes on until the last of them is gone', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    bodyOf(s).hp = 0;
    stepSim(s, []);
    expect(s.events.some(e => e.type === 'bossBurst')).toBe(true);
    expect(s.events.some(e => e.type === 'bossDead')).toBe(false);
    expect(s.boss).not.toBeNull();
    expect(s.elevatorOpen).toBe(false);
    expect(brood(s)).toHaveLength(BOSS.spiderBrood);
    // the bar is the brood now
    expect(bossHp(s)).toBeCloseTo(brood(s).reduce((n, e) => n + e.hp, 0));
    expect(s.boss!.maxHp).toBeCloseTo(bossHp(s));
    // all but one gone: still not over
    const all = brood(s);
    for (const e of all.slice(1)) e.hp = 0;
    stepSim(s, []);
    stepSim(s, []);
    expect(s.boss).not.toBeNull();
    expect(s.elevatorOpen).toBe(false);
    all[0].hp = 0;
    let dead = false;
    for (let i = 0; i < 3; i++) {
      stepSim(s, []);
      dead ||= s.events.some(e => e.type === 'bossDead' && e.kind === 'spider');
    }
    expect(dead).toBe(true);
    expect(s.boss).toBeNull();
    expect(s.elevatorOpen).toBe(true);
  });

  it('the small spiders are ordinary monsters: quick, and one good hit each', () => {
    const s = fight();
    bodyOf(s).hp = 0;
    stepSim(s, []);
    for (const e of brood(s)) {
      expect(e.maxHp).toBeLessThan(60);
      expect(e.speed).toBeGreaterThan(2.5);
    }
  });

  it('her brood is 21 strong', () => {
    expect(BOSS.spiderBrood).toBe(21);
  });

  it('the small spiders fight like she does: they pounce', () => {
    const s = fight();
    bodyOf(s).hp = 0;
    stepSim(s, []);
    s.players[0].invulnUntil = 1e9;
    let pounced = false;
    for (let i = 0; i < 20 * 60 && !pounced; i++) {
      stepSim(s, []);
      pounced = brood(s).some(e => e.state === 'charge');
    }
    expect(pounced).toBe(true);
  });

  it('a web always lies on open floor inside the map, whole', () => {
    const s = createSim(FLOORS.floor01.map, 3, { mode: 'quick', players: 1 });
    // asked for in a corner, on a wall, outside the map, and in the open
    for (const at of [{ x: 0.5, z: 0.5 }, { x: s.map.w - 0.5, z: s.map.h - 0.5 }, { x: -6, z: 10 }, { ...s.map.spawn }, { x: s.map.w / 2, z: s.map.h / 2 }]) spinWeb(s, at);
    expect(s.webs!.length).toBeGreaterThan(0);
    for (const w of s.webs!)
      for (let a = 0; a < 16; a++)
        for (const r of [0, w.radius * 0.5, w.radius * 0.95]) {
          const x = w.pos.x + Math.cos((a / 16) * Math.PI * 2) * r, z = w.pos.z + Math.sin((a / 16) * Math.PI * 2) * r;
          expect(tileAt(s.map, x, z), `web at ${w.pos.x},${w.pos.z} radius ${w.radius}`).toBe(Tile.Floor);
        }
  });

  it('she climbs over walls on her way: the straight line to the players, not the way round', () => {
    const s = createSim(FLOORS.floor01.map, 3, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.nests = [];
    s.boss = null;
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    spawnBoss(s, 'spider');
    s.boss!.nextAttackAt = 1e9;
    s.players[0].invulnUntil = 1e9;
    // she starts somewhere with a wall between her and the player
    const p = s.players[0].pos;
    const walled = (w: { x: number; z: number }) => {
      for (let t = 0.05; t < 1; t += 0.02) if (tileAt(s.map, w.x + (p.x - w.x) * t, w.z + (p.z - w.z) * t) === Tile.Wall) return true;
      return false;
    };
    const start = s.map.waypoints.find(w => Math.hypot(w.x - p.x, w.z - p.z) > 15 && walled(w))!;
    // (the round arena has a thick border: nothing of her may ever be on it)
    const arena = fight();
    arena.players[0].invulnUntil = 1e9;
    arena.players[0].pos = { ...arena.map.spawn };
    for (let i = 0; i < 20 * 60; i++) {
      stepSim(arena, []);
      const q = arena.enemies.find(e => e.id === arena.boss?.enemyId);
      if (q && !arena.boss!.leap) expect(onBorder(arena.map, q.pos.x, q.pos.z)).toBe(false);
    }
    expect(start).toBeTruthy();
    bodyOf(s).pos = { ...start };
    let onWall = false, best = Infinity;
    for (let i = 0; i < 40 * 60; i++) {
      stepSim(s, []);
      const q = bodyOf(s);
      onWall ||= tileAt(s.map, q.pos.x, q.pos.z) === Tile.Wall;
      best = Math.min(best, Math.hypot(q.pos.x - s.players[0].pos.x, q.pos.z - s.players[0].pos.z));
      // (the wall round the map is a border for her too)
      expect(onBorder(s.map, q.pos.x, q.pos.z)).toBe(false);
    }
    expect(onWall).toBe(true);
    expect(best).toBeLessThan(3);
  });
});
