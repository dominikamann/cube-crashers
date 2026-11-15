import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { WALDSEE_FIRE } from '../../src/sim/config/floor-waldsee';
import { createSim, stepSim } from '../../src/sim/sim';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos, isFree, nearestFree } from '../../src/sim/map/tilemap';
import { damageEnemy, updateProjectiles } from '../../src/sim/systems/combat';
import { WITCH, witchAloft, witchPounce } from '../../src/sim/systems/witch';
import type { Enemy, SimEvent, SimState } from '../../src/sim/types';

/** a Single floor of the Town: the witch at her fire, the player well away from it, and nothing else about */
function town(seed = 4): SimState {
  const s = createSim(FLOORS.waldsee.map, seed, { mode: 'quick', players: 1 });
  s.crates = [];
  s.enemies = s.enemies.filter(e => e.id === s.boss!.enemyId);
  s.players[0].pos = { x: WALDSEE_FIRE.x, z: WALDSEE_FIRE.z + 9 };
  s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
  s.boss!.unseen = undefined;
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;
const fromFire = (e: Enemy) => Math.hypot(e.pos.x - WALDSEE_FIRE.x, e.pos.z - WALDSEE_FIRE.z);
const run = (s: SimState, ticks: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSim(s, []);
    events.push(...s.events);
  }
  return events;
};
/** a place some way from the fire with houses between it and the fire */
const behindHouses = (s: SimState, me: Enemy) => {
  for (let r = 8; r < 20; r++)
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, q = { x: Math.floor(WALDSEE_FIRE.x + Math.cos(a) * r) + 0.5, z: Math.floor(WALDSEE_FIRE.z + Math.sin(a) * r) + 0.5 };
      if (q.x > 1 && q.z > 1 && q.x < s.map.w - 1 && q.z < s.map.h - 1 && isFree(s.map, q, me.radius, BLOCKS_ENEMY) && !hasLos(s.map, q, WALDSEE_FIRE)) return q;
    }
  throw new Error('no place behind houses');
};
/** she is hurt into her second phase: the dance is due */
const due = (s: SimState) => {
  const me = bodyOf(s);
  me.hp = me.maxHp * 0.6;
  s.boss!.gate = Infinity;
};

describe('the Schrättele flies to her fire on her broom', () => {
  it('gets onto her broom where she stands, with her laugh as the warning, and only then takes off', () => {
    const s = town();
    const me = bodyOf(s);
    const start = { ...me.pos };
    due(s);
    const first = run(s, 1);
    const w = s.boss!.witch!;
    expect(w.flight).toBeTruthy();
    expect(w.dance).toBeNull();
    expect(first.some(e => e.type === 'witchCackle' && e.boss)).toBe(true);
    // (no dance yet, no little witches, no drums)
    expect(first.some(e => e.type === 'witchDance')).toBe(false);
    const mounting = run(s, WITCH.mountTicks - 2);
    expect(mounting.some(e => e.type === 'witchFly')).toBe(false);
    expect(s.boss!.leap ?? null).toBeNull();
    expect(Math.hypot(me.pos.x - start.x, me.pos.z - start.z)).toBeLessThan(0.3);
    expect(s.enemies.filter(e => e.kind === 'witchling')).toHaveLength(0);
    const off = run(s, 3);
    expect(off.some(e => e.type === 'witchFly' && e.up)).toBe(true);
    expect(s.boss!.leap).toBeTruthy();
    expect(witchAloft(s, me)).toBe(true);
  });

  it('flies there in one even sweep, lands at her place on the circle, and the dance begins when she lands', () => {
    const s = town();
    const me = bodyOf(s);
    // (far from the fire, with houses between: she flies over them)
    me.pos = behindHouses(s, me);
    s.boss!.lastPos = { ...me.pos };
    due(s);
    let startedAt = -1, landTick = -1, last = { ...me.pos }, biggest = 0, landedAt = -1, dancing = -1, overWall = false;
    const events: SimEvent[] = [];
    for (let i = 0; i < WITCH.mountTicks + WITCH.flyMax + 20; i++) {
      stepSim(s, []);
      events.push(...s.events);
      biggest = Math.max(biggest, Math.hypot(me.pos.x - last.x, me.pos.z - last.z));
      last = { ...me.pos };
      if (startedAt < 0 && s.boss!.witch!.flight) startedAt = s.boss!.witch!.flight.at;
      if (s.boss!.witch!.flight?.land) landTick = s.boss!.witch!.flight.land;
      if (s.boss!.leap && !isFree(s.map, me.pos, 0.3, BLOCKS_ENEMY)) overWall = true;
      if (landedAt < 0 && s.events.some(e => e.type === 'witchFly' && !e.up)) landedAt = s.tick;
      if (dancing < 0 && s.boss!.witch!.dance) dancing = s.tick;
    }
    // (no jump from one tick to the next: she is seen all the way)
    expect(biggest).toBeLessThan(0.4);
    expect(overWall).toBe(true);
    expect(landedAt).toBeGreaterThan(0);
    expect(dancing).toBe(landedAt);
    const w = s.boss!.witch!;
    // (on the very tick her flight was to end)
    expect(w.dance!.at).toBe(landTick);
    // (the dance as a whole lasts no longer than before: its end counts from when she made for the fire)
    expect(w.dance!.until).toBe(startedAt + WITCH.danceTicks);
    expect(events.filter(e => e.type === 'witchDance')).toHaveLength(1);
    expect(Math.abs(fromFire(me) - WITCH.danceRadius)).toBeLessThan(0.6);
    expect(isFree(s.map, me.pos, me.radius, BLOCKS_ENEMY)).toBe(true);
    expect(s.enemies.filter(e => e.kind === 'witchling')).toHaveLength(w.dance!.helpers.length);
    // she goes round with them
    run(s, 120);
    expect(Math.abs(fromFire(me) - WITCH.danceRadius)).toBeLessThan(0.6);
  });

  it('never gets stuck: from anywhere on the map she reaches her place by the fire', () => {
    const base = town();
    const spots = base.map.waypoints.filter((_, i) => i % 3 === 0).slice(0, 12);
    for (const spot of spots) {
      const s = town();
      const me = bodyOf(s);
      me.pos = nearestFree(s.map, spot, me.radius, BLOCKS_ENEMY);
      due(s);
      run(s, WITCH.mountTicks + WITCH.flyMax + 4);
      expect(s.boss!.witch!.dance, `from ${spot.x},${spot.z}`).toBeTruthy();
      expect(Math.abs(fromFire(me) - WITCH.danceRadius), `from ${spot.x},${spot.z}`).toBeLessThan(0.8);
    }
  });

  it('in the air nothing on the floor reaches her: no hit, no blast, no shot along the floor', () => {
    const s = town();
    const me = bodyOf(s);
    due(s);
    run(s, WITCH.mountTicks + 5);
    expect(witchAloft(s, me)).toBe(true);
    const hp = me.hp;
    damageEnemy(s, me, 50, 'pixelBlaster', 0);
    damageEnemy(s, me, 50, 'explosion');
    expect(me.hp).toBe(hp);
    // a shot that runs along the floor passes under her
    const p = s.players[0];
    p.pos = nearestFree(s.map, { x: me.pos.x - 3, z: me.pos.z }, 0.4, BLOCKS_WALKER);
    s.projectiles.push({ id: s.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...p.pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 0, until: s.tick + 600, hitIds: [], ownerId: p.id, arc: { x: p.pos.x, z: p.pos.z, lift: 0, end: 0, reach: 9 } });
    for (let i = 0; i < 30; i++) updateProjectiles(s);
    expect(me.hp).toBe(hp);
  });

  it('a shot aimed up at her goes up to her and hits, as at someone on a jetpack (and counts for little)', () => {
    const s = town();
    const me = bodyOf(s);
    due(s);
    run(s, WITCH.mountTicks + 5);
    s.boss!.gate = Infinity;
    const p = s.players[0];
    p.pos = { x: me.pos.x - 3, z: me.pos.z };
    const hp = me.hp;
    s.projectiles.push({ id: s.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...p.pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 0, until: s.tick + 600, hitIds: [], ownerId: p.id });
    for (let i = 0; i < 30; i++) updateProjectiles(s);
    expect(me.hp).toBeLessThan(hp);
    expect(hp - me.hp).toBeLessThanOrEqual(10 * WITCH.danceArmor + 1e-6);
  });

  it('hurts nobody on her way: whoever stands under her flight is not touched', () => {
    const s = town();
    const me = bodyOf(s);
    me.pos = nearestFree(s.map, { x: WALDSEE_FIRE.x, z: WALDSEE_FIRE.z + 12 }, me.radius, BLOCKS_ENEMY);
    due(s);
    run(s, WITCH.mountTicks + 1);
    const p = s.players[0];
    p.invulnUntil = 0;
    let hurt = false;
    while (s.boss!.leap) {
      // (the player keeps right under her, out of the fire's heat)
      if (Math.hypot(me.pos.x - WALDSEE_FIRE.x, me.pos.z - WALDSEE_FIRE.z) > WITCH.danceHeat + 1.5) p.pos = { ...me.pos };
      const hp = p.hp;
      stepSim(s, []);
      if (p.hp < hp) hurt = true;
    }
    expect(hurt).toBe(false);
  });

  it('lets go of the player she presses before she gets onto her broom', () => {
    const s = town();
    const me = bodyOf(s);
    const p = s.players[0];
    p.pos = { x: me.pos.x + 4, z: me.pos.z };
    witchPounce(s, p);
    run(s, WITCH.pressLeapTicks + 5);
    expect(s.boss!.witch!.press?.playerId).toBe(p.id);
    due(s);
    const events = run(s, 2);
    expect(s.boss!.witch!.press).toBeNull();
    expect(events.some(e => e.type === 'witchRelease' && e.playerId === p.id)).toBe(true);
    expect(s.boss!.witch!.flight).toBeTruthy();
    run(s, WITCH.mountTicks + WITCH.flyMax + 4);
    expect(s.boss!.witch!.dance).toBeTruthy();
  });

  it('in mid-hop she comes down first, with no blow, and then gets onto her broom', () => {
    const s = town();
    const me = bodyOf(s);
    const p = s.players[0];
    p.pos = { x: me.pos.x + 5, z: me.pos.z };
    p.invulnUntil = 0;
    witchPounce(s, p, 'hop');
    run(s, 10);
    due(s);
    const events = run(s, WITCH.hopTicks);
    expect(events.some(e => e.type === 'blastWarning' || e.type === 'witchFly')).toBe(false);
    expect(s.blasts.filter(b => b.hidden)).toHaveLength(0);
    run(s, WITCH.mountTicks + WITCH.flyMax + 4);
    expect(s.boss!.witch!.dance).toBeTruthy();
  });

  it('has no line of sight to keep: she flies over the houses of the Town', () => {
    const s = town();
    const me = bodyOf(s);
    me.pos = behindHouses(s, me);
    expect(Math.hypot(me.pos.x - WALDSEE_FIRE.x, me.pos.z - WALDSEE_FIRE.z)).toBeGreaterThan(10);
    expect(hasLos(s.map, me.pos, WALDSEE_FIRE)).toBe(false);
  });
});
