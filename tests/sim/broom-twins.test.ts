import { describe, expect, it } from 'vitest';
import { BROOM, TWIN_BOSS } from '../../src/sim/config/balance';
import { FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { damageEnemy } from '../../src/sim/systems/combat';
import { ridesBroom, spawnEnemy } from '../../src/sim/systems/enemies';
import { allBosses } from '../../src/sim/util';
import type { Enemy, SimEvent, SimState } from '../../src/sim/types';

const run = (s: SimState, ticks: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, []);
    events.push(...s.events);
  }
  return events;
};

/** an empty plaza with one little witch a few tiles from the player: one on a broom, or one on foot */
function plaza(rider: boolean): { s: SimState; e: Enemy } {
  const s = createSim(floor01, 3, { mode: 'quick' });
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  const p = s.players[0];
  while ((s.nextId % 3 === 0) !== rider) s.nextId++;
  const e = spawnEnemy(s, 'witchling', { x: p.pos.x + 5, z: p.pos.z });
  return { s, e };
}

describe('little witches on brooms', () => {
  it('every third little witch rides, and nobody else does', () => {
    const { s } = plaza(true);
    const riders = Array.from({ length: 30 }, () => spawnEnemy(s, 'witchling', { ...s.players[0].pos })).filter(ridesBroom);
    expect(riders).toHaveLength(10);
    expect(ridesBroom(spawnEnemy(s, 'blob', { ...s.players[0].pos }))).toBe(false);
  });

  it('a rider draws back, swoops at the player she sees and rams them', () => {
    const { s, e } = plaza(true);
    const p = s.players[0];
    const hp = p.hp;
    const events = run(s, 30);
    expect(events.some(x => x.type === 'enemyWindup' && x.id === e.id)).toBe(true);
    expect(e.state).toBe('windup');
    run(s, BROOM.windupTicks + 40);
    expect(hp - p.hp).toBeGreaterThanOrEqual(BROOM.damage);
    // (and she needs a moment before the next swoop)
    expect(e.cooldownUntil).toBeGreaterThan(s.tick);
  });

  it('one on foot walks up as before, and never swoops', () => {
    const { s, e } = plaza(false);
    const events = run(s, 120);
    expect(events.some(x => x.type === 'enemyWindup' && x.id === e.id)).toBe(false);
    expect(e.state).toBe('move');
  });
});

describe('a boss that comes twice', () => {
  const arena = (players: number) => createSim(FLOORS.arena.map, 5, { mode: 'quick', players });

  it('a small team meets the boss of a floor once', () => {
    expect(allBosses(arena(TWIN_BOSS.players - 1))).toHaveLength(1);
  });

  it('a big team meets it twice: apart from each other, each with less health, together with more', () => {
    const one = allBosses(arena(TWIN_BOSS.players - 1))[0];
    const s = arena(TWIN_BOSS.players);
    const twins = allBosses(s);
    expect(twins).toHaveLength(2);
    expect(twins[0].kind).toBe(twins[1].kind);
    expect(Math.hypot(twins[0].lastPos.x - twins[1].lastPos.x, twins[0].lastPos.z - twins[1].lastPos.z)).toBeGreaterThan(3);
    expect(twins[0].maxHp).toBeCloseTo(twins[1].maxHp);
    expect(twins[0].maxHp).toBeLessThan(one.maxHp * 1.5);
    expect(twins[0].maxHp + twins[1].maxHp).toBeGreaterThan(one.maxHp);
  });

  it('the elevator opens only when both are down', () => {
    const s = arena(TWIN_BOSS.players);
    const kill = () => {
      const b = allBosses(s)[0];
      for (let i = 0; i < 400 && allBosses(s).includes(b); i++) {
        for (const e of s.enemies) if (e.id === b.enemyId || b.worms.flat().includes(e.id) || b.brood?.includes(e.id)) damageEnemy(s, e, 1e6, 'bomb');
        for (const p of s.players) p.hp = p.maxHp;
        stepSim(s, []);
      }
      expect(allBosses(s)).not.toContain(b);
    };
    kill();
    expect(allBosses(s)).toHaveLength(1);
    expect(s.elevatorOpen).toBe(false);
    kill();
    expect(allBosses(s)).toHaveLength(0);
    expect(s.boss).toBeNull();
    expect(s.elevatorOpen).toBe(true);
  });
});
