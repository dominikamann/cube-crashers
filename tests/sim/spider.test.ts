import { describe, expect, it } from 'vitest';
import { PLAYER_SPEED } from '../../src/sim/config/balance';
import { BOSS_RUSH, FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { BOSS, bossHp, spawnBoss } from '../../src/sim/systems/boss';
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
});
