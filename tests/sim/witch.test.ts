import { describe, expect, it } from 'vitest';
import { BOSS_RUSH, FLOORS, RUN_BOSSES, runBosses } from '../../src/sim/config/floors';
import { WALDSEE_FIRE } from '../../src/sim/config/floor-waldsee';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { BRAWL } from '../../src/sim/systems/boss';
import { damageEnemy } from '../../src/sim/systems/combat';
import { floorCleared } from '../../src/sim/systems/run';
import { WILD } from '../../src/sim/systems/wild-boss';
import { WITCH, witchPounce } from '../../src/sim/systems/witch';
import type { Command, SimState } from '../../src/sim/types';

/** a Single floor of the Town: the Schrättele at her fire, nobody else */
function town(players = 1, seed = 4): SimState {
  const s = createSim(FLOORS.waldsee.map, seed, { mode: 'quick', players });
  s.crates = [];
  for (const p of s.players) p.pos = { x: WALDSEE_FIRE.x, z: WALDSEE_FIRE.z + 9 };
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;
/** she stands and does nothing until told to */
const calm = (s: SimState) => {
  s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
  s.boss!.witch!.speed = 0;
};
const run = (s: SimState, ticks: number, cmds: (s: SimState) => Command[] = () => []) => {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, cmds(s));
    events.push(...s.events);
  }
  return events;
};

describe('the Schrättele', () => {
  it('is the boss of the Town, and appears beside her fire by the Federle-Brunnen', () => {
    expect(FLOORS.waldsee.boss).toBe('witch');
    const s = town();
    const b = s.boss!;
    expect(b.kind).toBe('witch');
    expect(b.witch!.fire).toEqual(WALDSEE_FIRE);
    const d = Math.hypot(bodyOf(s).pos.x - WALDSEE_FIRE.x, bodyOf(s).pos.z - WALDSEE_FIRE.z);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(4);
  });

  it("is the Town's boss in a Tower Run too, whatever the run's floors have", () => {
    const s = createSim(floor01, 4, { mode: 'run', between: ['town', 'race', 'lane', 'maze'] });
    for (const n of s.nests) n.state = 'destroyed';
    s.enemies = [];
    floorCleared(s);
    expect(s.map.id).toBe('waldsee');
    expect(s.boss?.kind).toBe('witch');
  });

  it('belongs to the Town: no other boss list picks her', () => {
    expect(BOSS_RUSH.map(b => b.boss)).not.toContain('witch');
    expect(BRAWL.kinds).not.toContain('witch');
    expect(Object.values(RUN_BOSSES).flat()).not.toContain('witch');
    expect(Object.values(WILD.fits).flat()).not.toContain('witch');
    for (let seed = 1; seed < 60; seed++) expect(runBosses(seed, ['floor01', 'candy', 'arena', 'neon', 'rooftop'])).not.toContain('witch');
  });

  it('her fire burns whoever stands in its heat, but not who jumps over it, nor who keeps away', () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 1, z: WALDSEE_FIRE.z };
    run(s, 60);
    const burnt = p.maxHp - p.hp;
    expect(burnt).toBeGreaterThan(WITCH.heatDps * 0.9 * 0.9);
    // keeping away
    p.hp = p.maxHp;
    p.pos = { x: WALDSEE_FIRE.x + WITCH.heat + 1.5, z: WALDSEE_FIRE.z };
    run(s, 60);
    expect(p.hp).toBe(p.maxHp);
  });

  it('attacks in many ways: charges and hops after a crouch, sweeps, throws twigs and leaps on players', () => {
    const s = town();
    const p = s.players[0];
    p.invulnUntil = Number.MAX_SAFE_INTEGER;
    // (the player keeps to one spot in the open, wherever her blows throw them)
    const spot = { x: WALDSEE_FIRE.x + 8, z: WALDSEE_FIRE.z + 2 };
    const seen = new Set<string>();
    for (let i = 0; i < 120 * 60; i++) {
      p.pos = { ...spot };
      stepSim(s, []);
      const m = s.boss?.witch?.move;
      if (m) seen.add(m.kind);
      if (s.boss?.leap) seen.add('hop');
      for (const e of s.events) if (e.type === 'witchTwigs' || e.type === 'witchSweep') seen.add(e.type);
    }
    for (const k of ['scan', 'hop', 'witchSweep', 'witchTwigs']) expect(seen, k).toContain(k);
    expect(seen.has('charge') || seen.has('hop')).toBe(true);
  });
});

describe('s\'Schrättele druckt', () => {
  const pressed = () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    witchPounce(s, p);
    const events = run(s, WITCH.pressLeapTicks + 2);
    return { s, p, events };
  };

  it('she leaps onto a player who stays put, and holds them down and hurts them while she sits on them', () => {
    const { s, p, events } = pressed();
    expect(events.some(e => e.type === 'witchPress' && e.playerId === p.id)).toBe(true);
    expect(s.boss!.witch!.press?.playerId).toBe(p.id);
    const at = { ...p.pos }, hp = p.hp;
    run(s, 60, () => [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)).toBeLessThan(0.05);
    expect(p.hp).toBeLessThan(hp);
  });

  it('a player who steps out of the ring in time is not caught', () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    witchPounce(s, p);
    const events = run(s, WITCH.pressLeapTicks + 2, () => [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(events.some(e => e.type === 'witchPress')).toBe(false);
    expect(s.boss!.witch!.press).toBeNull();
  });

  it('jumping again and again shakes her off, and she is dazed for a moment', () => {
    const { s, p } = pressed();
    let n = 0;
    const events = run(s, 60, () => (n++ % 6 === 0 ? [{ type: 'jump', playerId: 0 }] : []));
    const release = events.find(e => e.type === 'witchRelease');
    expect(release).toMatchObject({ playerId: p.id, broke: true });
    expect(s.boss!.witch!.press).toBeNull();
    expect(s.boss!.witch!.move?.kind).toBe('reel');
  });

  it('a dash counts double', () => {
    const { s } = pressed();
    run(s, 1, () => [{ type: 'dash', playerId: 0 }]);
    run(s, 1);
    run(s, 1, () => [{ type: 'dash', playerId: 0 }]);
    expect(s.boss!.witch!.press).toBeNull();
  });

  it('holding the jump key down is no struggle: only pressing it again is', () => {
    const { s } = pressed();
    run(s, 40, () => [{ type: 'jump', playerId: 0 }]);
    expect(s.boss!.witch!.press).not.toBeNull();
  });

  it('a teammate knocks her off with a few hits', () => {
    const s = town(2);
    calm(s);
    const [p, mate] = s.players;
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    mate.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 10 };
    witchPounce(s, p);
    run(s, WITCH.pressLeapTicks + 2);
    expect(s.boss!.witch!.press?.playerId).toBe(p.id);
    // the one held down hitting her does not count
    const me = bodyOf(s);
    damageEnemy(s, me, me.maxHp * WITCH.knock * 1.5, 'pixelBlaster', p.id);
    run(s, 1);
    expect(s.boss!.witch!.press).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      damageEnemy(s, me, me.maxHp * WITCH.knock * 0.4, 'pixelBlaster', mate.id);
      run(s, 1);
    }
    expect(s.boss!.witch!.press).toBeNull();
  });

  it('lets go by herself after a while, and the player has a moment to get away', () => {
    const { s, p } = pressed();
    const events = run(s, WITCH.pressTicks + 2);
    expect(events.find(e => e.type === 'witchRelease')).toMatchObject({ broke: false });
    expect(p.invulnUntil).toBeGreaterThan(s.tick);
    expect(p.downUntil).toBeNull();
  });
});

describe('the Schrättelestanz and the two faces', () => {
  it('from the second phase on she dances round the fire with small Schrättele, the heat grows and she hardly feels a hit', () => {
    const s = town();
    calm(s);
    const me = bodyOf(s);
    const events = (() => {
      me.hp = me.maxHp * 0.6;
      return run(s, 2);
    })();
    expect(events.some(e => e.type === 'witchDance')).toBe(true);
    const w = s.boss!.witch!;
    expect(w.dance!.helpers.length).toBe(WITCH.helpers[2]);
    expect(s.enemies.filter(e => e.kind === 'witchling')).toHaveLength(WITCH.helpers[2]);
    run(s, 240);
    expect(w.heat).toBeGreaterThan(WITCH.heat + 0.5);
    // she goes round the fire
    const r = Math.hypot(me.pos.x - w.fire.x, me.pos.z - w.fire.z);
    expect(Math.abs(r - WITCH.danceRadius)).toBeLessThan(0.6);
    // a hit counts for little while she dances
    s.boss!.gate = Infinity;
    const before = me.hp;
    damageEnemy(s, me, 40, 'pixelBlaster', 0);
    expect(before - me.hp).toBeCloseTo(40 * WITCH.danceArmor, 3);
  });

  it('the dance ends when the small ones are beaten, with a drum while it lasts', () => {
    const s = town();
    calm(s);
    bodyOf(s).hp = bodyOf(s).maxHp * 0.6;
    const drums = run(s, 120).filter(e => e.type === 'witchDrum').length;
    expect(drums).toBeGreaterThan(1);
    for (const e of s.enemies) if (e.kind === 'witchling') damageEnemy(s, e, 1000, 'pixelBlaster', 0);
    const events = run(s, 2);
    expect(events.some(e => e.type === 'witchDanceEnd')).toBe(true);
    expect(s.boss!.witch!.dance).toBeNull();
  });

  it('at half her health she turns her mask to the glaring face and gets quicker', () => {
    const s = town();
    calm(s);
    const me = bodyOf(s);
    expect(s.boss!.witch!.face).toBe('grin');
    s.boss!.witch!.speed = WITCH.speed;
    me.hp = me.maxHp * 0.49;
    const events = run(s, 2);
    expect(events.some(e => e.type === 'witchFace')).toBe(true);
    expect(s.boss!.witch!.face).toBe('glare');
    expect(s.boss!.witch!.speed).toBeCloseTo(WITCH.speed * WITCH.glareSpeed, 6);
  });

  it('when she falls, the small ones and the burning twigs go with her, and the elevator opens', () => {
    const s = town();
    calm(s);
    const me = bodyOf(s);
    me.hp = me.maxHp * 0.6;
    run(s, 2);
    s.boss!.witch!.embers.push({ id: 999, pos: { x: 1, z: 1 }, radius: 1, from: 0, until: s.tick + 1000 });
    me.hp = 0;
    const events = run(s, 2);
    expect(events.some(e => e.type === 'bossDead' && e.kind === 'witch')).toBe(true);
    expect(s.enemies.filter(e => e.kind === 'witchling')).toHaveLength(0);
    expect(s.boss).toBeNull();
    expect(s.elevatorOpen).toBe(true);
  });

  it('her burning twigs keep burning where they land', () => {
    const s = town();
    const p = s.players[0];
    p.invulnUntil = Number.MAX_SAFE_INTEGER;
    let most = 0;
    for (let i = 0; i < 90 * 60 && most === 0; i++) {
      stepSim(s, []);
      most = Math.max(most, (s.boss?.witch?.embers ?? []).filter(e => e.from <= s.tick).length);
    }
    expect(most).toBeGreaterThan(0);
  });
});
