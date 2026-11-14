import { describe, expect, it } from 'vitest';
import { BOSS_RUSH, FLOORS, RUN_BOSSES, runBosses } from '../../src/sim/config/floors';
import { WALDSEE_FIRE } from '../../src/sim/config/floor-waldsee';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { BRAWL, spawnBoss } from '../../src/sim/systems/boss';
import { BLOCKS_ENEMY, BLOCKS_WALKER, isFree, nearestFree, reachable } from '../../src/sim/map/tilemap';
import { damageEnemy } from '../../src/sim/systems/combat';
import { floorCleared } from '../../src/sim/systems/run';
import { spawnWild, WILD } from '../../src/sim/systems/wild-boss';
import { TOWN_WITCHLINGS, WITCH, witchPounce } from '../../src/sim/systems/witch';
import type { Command, SimState } from '../../src/sim/types';

/** a Single floor of the Town: the witch at her fire, nobody else */
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

describe('the witch', () => {
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

  it('is in every boss list, like the other bosses', () => {
    expect(BOSS_RUSH.map(b => b.boss)).toContain('witch');
    expect(BOSS_RUSH.find(b => b.boss === 'witch')?.map).toBe('waldsee');
    expect(BRAWL.kinds).toContain('witch');
    expect(Object.values(RUN_BOSSES).flat()).toContain('witch');
    expect(Object.values(WILD.fits).flat()).toContain('witch');
    const picked = new Set<string>();
    for (let seed = 1; seed < 200; seed++) for (const b of runBosses(seed, ['floor01', 'candy', 'arena', 'neon', 'rooftop'])) if (b) picked.add(b);
    expect(picked).toContain('witch');
  });

  it('a run that goes through the Town does not meet her on one of its floors as well', () => {
    let withTown = 0, without = 0;
    for (let seed = 1; seed < 200; seed++) {
      const s = createSim(floor01, seed, { mode: 'run' });
      const town = s.run.between!.includes('town');
      if (town) withTown++;
      else if (s.run.bosses!.includes('witch')) without++;
      if (town) expect(s.run.bosses, `seed ${seed}`).not.toContain('witch');
      expect(s.run.bosses).toEqual(createSim(floor01, seed, { mode: 'run' }).run.bosses);
    }
    expect(withTown).toBeGreaterThan(0);
    // (without the Town she is still one of the floors' bosses)
    expect(without).toBeGreaterThan(0);
  });

  it('on any other map she lights her own fire on open floor the players can reach, clear of the elevator, and fights there', () => {
    for (const map of ['arena', 'rooftop', 'floor01', 'servers', 'jungle'] as const) {
      const s = createSim(FLOORS[map].map, 3, { mode: 'quick' });
      s.enemies = [];
      s.boss = null;
      s.nests = [];
      s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
      spawnBoss(s, 'witch');
      const w = s.boss!.witch!, me = bodyOf(s);
      expect(isFree(s.map, w.fire, WITCH.heat, BLOCKS_ENEMY), map).toBe(true);
      expect(reachable(s.map, s.map.spawn, BLOCKS_WALKER)[Math.floor(w.fire.z) * s.map.w + Math.floor(w.fire.x)], map).toBe(1);
      expect(Math.hypot(w.fire.x - s.map.elevator.x, w.fire.z - s.map.elevator.z), map).toBeGreaterThan(WITCH.heat + 2);
      // she stands beside it, out of its heat
      expect(Math.hypot(me.pos.x - w.fire.x, me.pos.z - w.fire.z), map).toBeGreaterThan(WITCH.heat);
      const p = s.players[0];
      p.invulnUntil = Number.MAX_SAFE_INTEGER;
      p.pos = nearestFree(s.map, { x: w.fire.x + 7, z: w.fire.z }, 0.4, BLOCKS_WALKER);
      let attacks = 0;
      for (let i = 0; i < 30 * 60; i++) {
        stepSim(s, []);
        attacks += s.events.filter(e => e.type === 'bossAttack').length;
      }
      expect(attacks, map).toBeGreaterThan(2);
      // hurt, she dances round her own fire
      me.hp = me.maxHp * 0.6;
      run(s, 120);
      expect(s.boss!.witch!.dance, map).not.toBeNull();
    }
  });

  it('comes into a Boss Brawl and as a wild boss with a fire of her own', () => {
    const s = createSim(FLOORS.floor01.map, 3, { mode: 'quick' });
    s.enemies = [];
    s.boss = null;
    const wild = spawnWild(s, 'witch', { ...s.map.elevator });
    expect(wild?.kind).toBe('witch');
    expect(wild?.witch).toBeDefined();
    expect(isFree(s.map, wild!.witch!.fire, WITCH.heat, BLOCKS_ENEMY)).toBe(true);
    const brawl = createSim(FLOORS.arena.map, 3, { mode: 'brawl' });
    brawl.brawl!.queue = ['witch', 'rex'];
    run(brawl, 2);
    expect(brawl.bosses!.map(b => b.kind)).toContain('witch');
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

describe("s'Schrättele druckt", () => {
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

  it('nothing on the floor shows where she will land', () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    for (const next of ['press', 'hop'] as const) {
      s.boss!.witch!.press = null;
      witchPounce(s, p, next);
      const events = run(s, 5);
      expect(events.some(e => e.type === 'blastWarning'), next).toBe(false);
      expect(s.blasts.filter(b => !b.hidden), next).toHaveLength(0);
      run(s, 120);
    }
  });

  it('in the air she bends her flight after a player who only steps aside a little', () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    witchPounce(s, p);
    // a short step aside, then standing still: out of where she aimed, but she follows
    let n = 0;
    const events = run(s, WITCH.pressLeapTicks + 2, () => (n++ < 12 ? [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }] : []));
    expect(events.some(e => e.type === 'witchPress')).toBe(true);
  });

  it('her hop strikes where she lands and throws the player, without a warning on the floor', () => {
    const s = town();
    calm(s);
    const p = s.players[0];
    p.pos = { x: WALDSEE_FIRE.x + 6, z: WALDSEE_FIRE.z + 4 };
    const at = { ...p.pos };
    witchPounce(s, p, 'hop');
    run(s, WITCH.hopTicks + 4);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)).toBeGreaterThan(1);
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
  it('from the second phase on she dances round the fire with little witches, the heat grows and she hardly feels a hit', () => {
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
    // (her dancers: the little witches out in the streets go their own way, in hordes of their own)
    expect(s.enemies.filter(e => e.kind === 'witchling' && e.hordeId === null)).toHaveLength(WITCH.helpers[2]);
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
    // (the little witches out in the streets are squashed already)
    s.enemies = s.enemies.filter(e => !(e.kind === 'witchling' && e.hordeId !== null));
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
    // (she has seen the player already)
    s.boss!.unseen = undefined;
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

describe('the Schrättele keeps watch', () => {
  it('attacks nobody until she sees someone, then she does', () => {
    const s = town();
    const me = bodyOf(s);
    // (out of her sight: far off behind the houses)
    const far = s.map.waypoints.filter(w => Math.hypot(w.x - me.pos.x, w.z - me.pos.z) > 25)[0];
    s.players[0].pos = nearestFree(s.map, far, 0.4, BLOCKS_WALKER);
    const seenAttacks = (ticks: number) => run(s, ticks).filter(e => e.type === 'bossAttack' || e.type === 'witchPress' || e.type === 'blastWarning').length;
    expect(seenAttacks(20 * 60)).toBe(0);
    expect(s.boss!.unseen).toBe(true);
    // she sees the player: it starts
    s.players[0].pos = nearestFree(s.map, { x: me.pos.x + 4, z: me.pos.z }, 0.4, BLOCKS_WALKER);
    run(s, 30);
    expect(s.boss!.unseen).toBeUndefined();
  });
});

describe('the Schrättele as a wild boss', () => {
  it('stands still by the elevator until someone wakes her', async () => {
    const { createSim, stepSim } = await import('../../src/sim/sim');
    const { floor01 } = await import('../../src/sim/config/floor01');
    const { releaseWildBoss } = await import('../../src/sim/systems/wild-boss');
    const s = createSim(floor01, 5, { mode: 'run', between: ['race', 'lane', 'maze', 'shaft'] });
    s.enemies.length = 0;
    s.wild = { kind: 'witch' };
    expect(releaseWildBoss(s)).toBe(true);
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    const start = { ...body.pos };
    // (the players far away, so nothing wakes her)
    const far = [...s.map.waypoints].sort((a, b) => Math.hypot(b.x - start.x, b.z - start.z) - Math.hypot(a.x - start.x, a.z - start.z))[0];
    for (const p of s.players) p.pos = { ...far };
    for (let i = 0; i < 120; i++) stepSim(s, []);
    expect(Math.hypot(body.pos.x - start.x, body.pos.z - start.z)).toBeLessThan(0.5);
  });
});

describe('the little witches about the Town', () => {
  const wanderers = (s: SimState) => s.enemies.filter(e => e.kind === 'witchling' && e.hordeId !== null && e.hp > 0);

  it('a few of them walk about the Town on their own, spread over it and away from the start, not yet after anyone', () => {
    const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick', players: 1 });
    const ws = wanderers(s);
    expect(ws.length).toBeGreaterThanOrEqual(TOWN_WITCHLINGS);
    for (const e of ws) {
      expect(Math.hypot(e.pos.x - s.map.spawn.x, e.pos.z - s.map.spawn.z)).toBeGreaterThan(10);
      expect(s.hordes.find(h => h.id === e.hordeId)?.aggro).toBe(false);
    }
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      if (ws[i].hordeId === ws[j].hordeId) continue;
      expect(Math.hypot(ws[i].pos.x - ws[j].pos.x, ws[i].pos.z - ws[j].pos.z)).toBeGreaterThan(8);
    }
  });

  it('they wander until they see someone, then come for them', () => {
    const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick', players: 1 });
    calm(s);
    const e = wanderers(s)[0];
    const start = { ...e.pos };
    run(s, 900);
    expect(Math.hypot(e.pos.x - start.x, e.pos.z - start.z)).toBeGreaterThan(1);
    // someone steps into sight: the little witch is after them
    s.players[0].pos = nearestFree(s.map, { x: e.pos.x + 3, z: e.pos.z }, 0.4, BLOCKS_WALKER);
    run(s, 20);
    expect(s.hordes.find(h => h.id === e.hordeId)?.aggro).toBe(true);
  });

  it('the elevator stays shut while one of them is left, even when the witch is beaten', () => {
    const s = town();
    calm(s);
    bodyOf(s).hp = 0;
    run(s, 2);
    expect(s.boss).toBeNull();
    expect(wanderers(s).length).toBeGreaterThan(0);
    expect(s.elevatorOpen).toBe(false);
    for (const e of wanderers(s)) damageEnemy(s, e, 1000, 'pixelBlaster', 0);
    const events = run(s, 2);
    expect(s.elevatorOpen).toBe(true);
    expect(events.some(e => e.type === 'elevatorOpen')).toBe(true);
  });
});
