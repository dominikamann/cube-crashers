import { describe, expect, it } from 'vitest';
import { FLOORS, RUN_FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim } from '../../src/sim/sim';
import { alertBoss, BOSS, bossHp, megaLeap } from '../../src/sim/systems/boss';
import { damageEnemy } from '../../src/sim/systems/combat';
import { BOSS_HP } from '../../src/sim/config/balance';
import { damagePlayer } from '../../src/sim/systems/player';
import { enterFloor } from '../../src/sim/systems/run';
import type { Enemy, SimEvent, SimState } from '../../src/sim/types';
import { rel, run } from './helpers';

function bossFloor(kind: 'megaBlock' | 'worm', players = 1): SimState {
  const s = createSim(floor01, 4, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'], players });
  const index = RUN_FLOORS.findIndex(id => FLOORS[id].boss === kind);
  // the floors' own bosses, whatever the seed would pick
  s.run.floors = [...RUN_FLOORS];
  s.run.bosses = undefined;
  enterFloor(s, index);
  // (it knows the players are there: see boss-unaware.test.ts for the boss that has not seen anyone yet)
  alertBoss(s, s.boss!);
  s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
  s.hordes = [];
  s.enemies = s.enemies.filter(e => e.kind === 'megaBlock' || e.kind === 'wormSegment');
  for (const p of s.players) p.invulnUntil = 0;
  return s;
}

const segs = (s: SimState, worm = 0): Enemy[] => s.boss!.worms[worm].map(id => s.enemies.find(e => e.id === id)!);
const kill = (s: SimState, e: Enemy) => damageEnemy(s, e, 1e9, 'pixelBlaster', 0);

describe('the run', () => {
  it('has five floors with a boss on 3 and 5', () => {
    expect(RUN_FLOORS).toHaveLength(5);
    expect(FLOORS[RUN_FLOORS[2]].boss).toBe('megaBlock');
    expect(FLOORS[RUN_FLOORS[4]].boss).toBe('worm');
  });
});

describe('boss floors', () => {
  it('have a boss instead of nests, and the alarm stays quiet', () => {
    const s = bossFloor('megaBlock');
    expect(s.nests).toHaveLength(0);
    expect(s.boss?.kind).toBe('megaBlock');
    expect(s.enemies.some(e => e.kind === 'megaBlock')).toBe(true);
    run(s, 4000);
    expect(s.alarm.level).toBe(0);
  });

  it('open the elevator when the boss falls, with a coin shower, exactly once', () => {
    const s = bossFloor('megaBlock');
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    kill(s, boss);
    const events = run(s, 3);
    expect(events.filter(e => e.type === 'bossDead')).toHaveLength(1);
    expect(s.elevatorOpen).toBe(true);
    expect(s.coins.length).toBeGreaterThanOrEqual(BOSS.deathCoins);
    expect(s.boss).toBeNull();
  });

  it('give exactly one outcome when the boss dies in the tick the last credit is lost', () => {
    const s = bossFloor('megaBlock');
    s.players[0].lives = 1;
    kill(s, s.enemies.find(e => e.kind === 'megaBlock')!);
    damagePlayer(s, s.players[0], 1000);
    const events: SimEvent[] = [...s.events, ...run(s, 5)];
    expect(events.filter(e => e.type === 'gameWon' || e.type === 'gameLost')).toHaveLength(1);
    expect(s.phase).toBe('lost');
  });
});

describe('Mega Block', () => {
  it('scales its health with the team and the difficulty', () => {
    const one = bossFloor('megaBlock', 1);
    const four = bossFloor('megaBlock', 4);
    expect(four.boss!.maxHp).toBeCloseTo(one.boss!.maxHp * (1 + 3 * BOSS_HP.teamStep));
  });

  it('leaps at a player: a big ring warns where it lands, and it comes down there', () => {
    const s = bossFloor('megaBlock');
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    const p = s.players[0];
    p.invulnUntil = 1e9;
    p.pos = { x: boss.pos.x + 9, z: boss.pos.z + 2 };
    const target = { ...p.pos };
    megaLeap(s, p);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'blastWarning', radius: BOSS.leapRadius }));
    const events = run(s, BOSS.leapTicks + 2);
    expect(Math.hypot(boss.pos.x - target.x, boss.pos.z - target.z)).toBeLessThan(1.5);
    expect(events).toContainEqual(expect.objectContaining({ type: 'stomp' }));
    expect(s.boss!.leap ?? null).toBeNull();
  });

  it('gets faster with every phase', () => {
    const s = bossFloor('megaBlock');
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    const speed = boss.speed;
    // (set, not dealt: a boss takes one big hit only in part)
    boss.hp = boss.maxHp * 0.6;
    run(s, 3);
    expect(boss.speed).toBeGreaterThan(speed * 1.2);
  });

  it('enters each phase once and calls reinforcements', () => {
    const s = bossFloor('megaBlock');
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    boss.hp = boss.maxHp * 0.6;
    const events = run(s, 3);
    expect(events.filter(e => e.type === 'bossPhase')).toEqual([{ type: 'bossPhase', phase: 2 }]);
    expect(s.enemies.length).toBeGreaterThan(1);
    expect(run(s, 30).filter(e => e.type === 'bossPhase')).toHaveLength(0);
  });

  it('stomps where a player stands after a warning: hits who stays, misses who leaves', () => {
    const chance = BOSS.stompChance;
    BOSS.stompChance = 1;
    const s = bossFloor('megaBlock');
    const p = s.players[0];
    s.boss!.nextAttackAt = s.tick;
    const events = run(s, 2);
    expect(events.some(e => e.type === 'blastWarning')).toBe(true);
    run(s, 70);
    expect(p.hp).toBeLessThan(100);

    const t = bossFloor('megaBlock');
    const q = t.players[0];
    t.boss!.nextAttackAt = t.tick;
    run(t, 2);
    q.pos = rel(q.pos, 4, 0);
    run(t, 70);
    expect(q.hp).toBe(100);
    BOSS.stompChance = chance;
  });
});

describe('Segment Worm', () => {
  it('starts as one long worm', () => {
    const s = bossFloor('worm');
    expect(s.boss!.worms).toHaveLength(1);
    expect(segs(s)).toHaveLength(BOSS.wormSegments);
  });

  it('splits in two when a middle segment is destroyed', () => {
    const s = bossFloor('worm');
    kill(s, segs(s)[7]);
    run(s, 1);
    expect(s.boss!.worms.map(w => w.length).sort((a, b) => a - b)).toEqual([7, BOSS.wormSegments - 8]);
    expect(s.events.some(e => e.type === 'wormSplit')).toBe(true);
  });

  it('does not split into pieces smaller than 3', () => {
    const s = bossFloor('worm');
    kill(s, segs(s)[1]);
    run(s, 1);
    expect(s.boss!.worms).toHaveLength(1);
    expect(s.boss!.worms[0]).toHaveLength(BOSS.wormSegments - 1);
  });

  it('never has more than 4 worms', () => {
    const s = bossFloor('worm');
    for (let i = 0; i < 8; i++) {
      const longest = s.boss!.worms.reduce((a, b) => (b.length > a.length ? b : a));
      const list = longest.map(id => s.enemies.find(e => e.id === id)!);
      kill(s, list[Math.floor(list.length / 2)]);
      run(s, 1);
    }
    expect(s.boss!.worms.length).toBeLessThanOrEqual(4);
  });

  it('chases the players', () => {
    const s = bossFloor('worm');
    const head = segs(s)[0];
    const p = s.players[0];
    const before = Math.hypot(head.pos.x - p.pos.x, head.pos.z - p.pos.z);
    p.invulnUntil = 1e9;
    run(s, 120);
    expect(Math.hypot(head.pos.x - p.pos.x, head.pos.z - p.pos.z)).toBeLessThan(before);
  });

  it('is beaten when every segment is gone', () => {
    const s = bossFloor('worm');
    for (const e of segs(s)) kill(s, e);
    const events = run(s, 2);
    expect(events.filter(e => e.type === 'bossDead')).toHaveLength(1);
    expect(s.elevatorOpen).toBe(true);
    expect(bossHp(s)).toBe(0);
  });
});
