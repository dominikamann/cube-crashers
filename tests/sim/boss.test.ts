import { describe, expect, it } from 'vitest';
import { createSim, stepSim } from '../../src/sim/sim';
import { map01 } from '../../src/sim/config/map01';
import { WAVES } from '../../src/sim/config/waves';
import { damageEnemy } from '../../src/sim/systems/combat';
import { addTelegraph, bossHp, computeStars, startBoss } from '../../src/sim/systems/boss';
import type { Enemy, SimState, WeaponKind } from '../../src/sim/types';
import { quietSim, run } from './helpers';

function wormSim(): SimState {
  const s = quietSim();
  s.players[0].weapons = [];
  startBoss(s, 'worm');
  s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
  return s;
}

function segments(s: SimState, worm = 0): Enemy[] {
  return s.boss!.worms[worm].segmentIds.map(id => s.enemies.find(e => e.id === id)!);
}

function kill(s: SimState, e: Enemy) {
  damageEnemy(s, e, 1e9, 'pixelBlaster');
}

describe('segment worm', () => {
  it('spawns 16 segments and switches to the night look', () => {
    const s = wormSim();
    expect(s.boss!.worms).toHaveLength(1);
    expect(segments(s)).toHaveLength(16);
    expect(s.look).toBe('night');
    expect(s.events).toContainEqual({ type: 'bossSpawn', kind: 'worm' });
  });

  it('splits in two when a middle segment is destroyed', () => {
    const s = wormSim();
    kill(s, segments(s)[7]);
    stepSim(s, []);
    expect(s.boss!.worms.map(w => w.segmentIds.length).sort()).toEqual([7, 8]);
    expect(s.events.some(e => e.type === 'wormSplit')).toBe(true);
  });

  it('does not split when a part would have fewer than 3 segments', () => {
    const s = wormSim();
    segments(s).slice(4).forEach(e => (s.enemies = s.enemies.filter(x => x !== e)));
    s.boss!.worms[0].segmentIds = s.boss!.worms[0].segmentIds.slice(0, 4);
    kill(s, segments(s)[1]);
    stepSim(s, []);
    expect(s.boss!.worms).toHaveLength(1);
    expect(s.boss!.worms[0].segmentIds).toHaveLength(3);
  });

  it('never has more than 4 worms', () => {
    const s = wormSim();
    for (let round = 0; round < 6; round++) {
      const longest = s.boss!.worms.reduce((a, b) => (b.segmentIds.length > a.segmentIds.length ? b : a));
      const segs = longest.segmentIds.map(id => s.enemies.find(e => e.id === id)!);
      kill(s, segs[Math.floor(segs.length / 2)]);
      stepSim(s, []);
    }
    expect(s.boss!.worms.length).toBeLessThanOrEqual(4);
  });

  it('removes head or tail without splitting', () => {
    const s = wormSim();
    kill(s, segments(s)[0]);
    kill(s, segments(s)[15]);
    stepSim(s, []);
    expect(s.boss!.worms).toHaveLength(1);
    expect(s.boss!.worms[0].segmentIds).toHaveLength(14);
  });

  it('enters phase 2 below 66 % and calls 8 blobs, once', () => {
    const s = wormSim();
    const segs = segments(s);
    for (let i = 0; i < 6; i++) kill(s, segs[i]);
    const events = run(s, 3);
    expect(bossHp(s) / s.boss!.maxHp).toBeLessThan(0.66);
    expect(events.filter(e => e.type === 'bossPhase')).toEqual([{ type: 'bossPhase', phase: 2 }]);
    expect(s.enemies.filter(e => e.kind === 'blob')).toHaveLength(8);
  });

  it('wins exactly once when the last segments die in the same tick, and returns to day', () => {
    const s = wormSim();
    s.wave.index = WAVES.length - 1;
    const segs = segments(s);
    const events = [];
    for (const e of segs) kill(s, e);
    stepSim(s, []);
    events.push(...s.events);
    events.push(...run(s, 5));
    expect(events.filter(e => e.type === 'gameWon')).toHaveLength(1);
    expect(events.filter(e => e.type === 'bossDead')).toHaveLength(1);
    expect(s.phase).toBe('won');
    expect(s.look).toBe('day');
  });

  it('drops a coin burst when it dies', () => {
    const s = wormSim();
    for (const e of segments(s)) kill(s, e);
    stepSim(s, []);
    expect(s.coins.length).toBeGreaterThanOrEqual(40);
    expect(s.boss).toBeNull();
  });
});

describe('telegraphed attacks', () => {
  it('hit the player standing inside the ring', () => {
    const s = wormSim();
    const p = s.players[0];
    addTelegraph(s, { ...p.pos }, 2, 72, 30);
    const events = run(s, 73);
    expect(events.some(e => e.type === 'bossImpact')).toBe(true);
    expect(p.hp).toBe(70);
  });

  it('miss the player who walked out in time', () => {
    const s = wormSim();
    const p = s.players[0];
    addTelegraph(s, { ...p.pos }, 2, 72, 30);
    for (let i = 0; i < 73; i++) stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(p.hp).toBe(100);
  });

  it('damage towers inside the ring', () => {
    const s = wormSim();
    s.towers.push({ id: 999, kind: 'laser', padId: 0, pos: { ...s.map.pads[0].pos }, hp: 40, maxHp: 40, cooldown: 99 });
    addTelegraph(s, { ...s.map.pads[0].pos }, 2, 10, 30);
    run(s, 11);
    expect(s.towers[0].hp).toBe(20);
  });
});

describe('mini-boss', () => {
  it('spawns in wave 5 and ends the boss when killed', () => {
    const s = quietSim();
    s.players[0].weapons = [];
    startBoss(s, 'miniboss');
    const mb = s.enemies.find(e => e.kind === 'miniboss')!;
    expect(mb.hp).toBe(400);
    kill(s, mb);
    stepSim(s, []);
    expect(s.events.some(e => e.type === 'bossDead')).toBe(true);
    expect(s.boss).toBeNull();
    expect(s.phase).toBe('playing');
  });
});

describe('stars', () => {
  it('rates by remaining base hp', () => {
    const s = quietSim();
    s.base.hp = 20;
    expect(computeStars(s)).toBe(3);
    s.base.hp = 10;
    expect(computeStars(s)).toBe(2);
    s.base.hp = 4;
    expect(computeStars(s)).toBe(1);
  });
});

describe('full game', () => {
  it('can be won by a maxed-out player standing still', () => {
    const s = createSim(map01, 1);
    const all: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'discoBall'];
    s.players[0].weapons = all.map(kind => ({ kind, level: 5, cooldown: 0 }));
    for (let i = 0; i < 20 * 60 * 60 && s.phase === 'playing'; i++) stepSim(s, []);
    expect(s.phase).toBe('won');
  });
});
