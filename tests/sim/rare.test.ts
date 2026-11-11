import { afterEach, describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/sim/config/enemies';
import { RARE } from '../../src/sim/config/rare';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { Command, RareKind, SimState } from '../../src/sim/types';
import { aimAt, fire, quietSim, rel, run } from './helpers';

const selectRare: Command = { type: 'select', playerId: 0, slot: -1 };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function armed(kind: RareKind): SimState {
  const s = quietSim();
  s.players[0].rare = { kind, until: s.tick + RARE.durationTicks, cooldown: 0 };
  s.players[0].rareSelected = true;
  return s;
}

describe('rare cards', () => {
  const chance = RARE.cardChance;
  afterEach(() => {
    RARE.cardChance = chance;
  });

  it('sometimes turn up in a crate and fill the rare slot', () => {
    RARE.cardChance = 1;
    const s = quietSim();
    s.crates.push({ id: s.nextId++, pos: rel(s.players[0].pos, 0.3, 0) });
    stepSim(s, []);
    const offer = s.offers[0];
    const i = offer.cards.findIndex(c => c.type === 'rare');
    expect(i).toBeGreaterThanOrEqual(0);
    s.players[0].pos = { ...offer.cardPos[i] };
    run(s, 40);
    const p = s.players[0];
    expect(p.rare?.kind).toBeDefined();
    expect(p.rareSelected).toBe(true);
    expect(p.rare!.until - s.tick).toBeGreaterThan(RARE.durationTicks - 20);
  });

  it('never turn up when the dice say no', () => {
    RARE.cardChance = 0;
    const s = quietSim();
    s.crates.push({ id: s.nextId++, pos: rel(s.players[0].pos, 0.3, 0) });
    stepSim(s, []);
    expect(s.offers[0].cards.some(c => c.type === 'rare')).toBe(false);
  });
});

describe('rare slot', () => {
  it('Q selects it, a number key goes back to a normal weapon', () => {
    const s = armed('pizzaCutter');
    const p = s.players[0];
    stepSim(s, [{ type: 'select', playerId: 0, slot: 0 }]);
    expect(p.rareSelected).toBe(false);
    stepSim(s, [selectRare]);
    expect(p.rareSelected).toBe(true);
  });

  it('crumbles after 60 seconds', () => {
    const s = armed('pizzaCutter');
    const events = run(s, RARE.durationTicks + 1);
    expect(events).toContainEqual({ type: 'rareExpired', playerId: 0 });
    expect(s.players[0].rare).toBeNull();
    expect(s.players[0].rareSelected).toBe(false);
  });

  it('cannot be selected when empty', () => {
    const s = quietSim();
    stepSim(s, [selectRare]);
    expect(s.players[0].rareSelected).toBe(false);
  });
});

describe('slush machine', () => {
  it('freezes a monster after a second in the spray; frozen monsters stand still and take double damage', () => {
    const s = armed('slushMachine');
    const p = s.players[0];
    const blob = spawnEnemy(s, 'tank', rel(p.pos, 0, -3));
    run(s, 70, () => [aimAt(blob.pos), fire]);
    expect(blob.frozenUntil).toBeGreaterThan(s.tick);
    const at = { ...blob.pos };
    run(s, 30);
    expect(dist(blob.pos, at)).toBeLessThan(0.01);
    const hp = blob.hp;
    s.players[0].rareSelected = false;
    s.players[0].pos = rel(blob.pos, 0, 6);
    stepSim(s, [aimAt(blob.pos), fire]);
    run(s, 30);
    expect(hp - blob.hp).toBe(8);
  });
});

describe('bubblegum bazooka', () => {
  it('traps monsters in a bubble that pops after 3 seconds', () => {
    const s = armed('bubblegumBazooka');
    const p = s.players[0];
    p.pos.z = 66.5;
    const tank = spawnEnemy(s, 'tank', rel(p.pos, 0, -4));
    stepSim(s, [aimAt(tank.pos), fire]);
    run(s, 25);
    expect(s.bubbles).toHaveLength(1);
    const at = { ...tank.pos };
    run(s, 100);
    expect(dist(tank.pos, at)).toBeLessThan(0.01);
    const events = run(s, 100);
    expect(events.some(e => e.type === 'explosion')).toBe(true);
    expect(s.bubbles).toHaveLength(0);
    expect(tank.hp).toBeLessThanOrEqual(ENEMIES.tank.hp - RARE.bubble.damage);
  });
});

describe('leaf blower', () => {
  it('blows monsters away', () => {
    const s = armed('leafBlower');
    const p = s.players[0];
    p.pos.z = 66.5;
    const tank = spawnEnemy(s, 'tank', rel(p.pos, 0, -3));
    tank.speed = 0;
    run(s, 40, () => [aimAt(rel(p.pos, 0, -6)), fire]);
    expect(dist(tank.pos, p.pos)).toBeGreaterThan(5);
  });

  it('hurts monsters it slams into a wall', () => {
    const s = armed('leafBlower');
    const p = s.players[0];
    p.pos = { x: 40.5, z: 55.5 };
    const tank = spawnEnemy(s, 'tank', { x: 40.5, z: 52.2 });
    tank.speed = 0;
    run(s, 40, () => [aimAt({ x: 40.5, z: 48 }), fire]);
    expect(tank.hp).toBeLessThanOrEqual(ENEMIES.tank.hp - RARE.blower.slamDamage);
  });
});

describe('pizza cutter', () => {
  it('bounces off a wall and cuts what is behind the thrower', () => {
    const s = armed('pizzaCutter');
    const p = s.players[0];
    p.pos = { x: 40.5, z: 53.5 };
    const behind = spawnEnemy(s, 'tank', { x: 40.5, z: 56.5 });
    behind.speed = 0;
    stepSim(s, [aimAt({ x: 40.5, z: 48 }), fire]);
    run(s, 90);
    expect(behind.hp).toBeLessThan(ENEMIES.tank.hp);
  });
});
