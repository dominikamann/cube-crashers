import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT, PITCH_DOWN, PITCH_START, PITCH_UP, aimDistance } from '../../src/input/first-person';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim } from '../../src/sim/sim';
import { updateProjectiles } from '../../src/sim/systems/combat';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { SHOT_HEIGHT, clampAimPitch, lookedWay, shotHeight, shotLift } from '../../src/sim/systems/shot-height';
import type { Player, Projectile, SimState } from '../../src/sim/types';
import { aimAt, fire as fireCmd, quietSim, rel, run } from './helpers';

const heightAfter = (lift: number, pitch: number, travelled: number) => {
  const way = lookedWay(lift, pitch);
  return shotLift(lift, travelled, way.reach, way.end);
};

describe('the way of a shot along the view', () => {
  it('uses the eye height of the first-person view', () => {
    expect(SHOT_HEIGHT.eye).toBe(EYE_HEIGHT);
  });
  it('goes up when the view is tilted up, and keeps going up', () => {
    expect(heightAfter(0, PITCH_UP, 4)).toBeGreaterThan(1.25);
    expect(heightAfter(0, PITCH_UP, 12)).toBeGreaterThan(heightAfter(0, PITCH_UP, 4) * 2.5);
    expect(heightAfter(0, 0.2, 6)).toBeLessThan(heightAfter(0, PITCH_UP, 6));
  });
  it('meets the line of sight far ahead, so a level look stays about level', () => {
    const at = heightAfter(0, 0, SHOT_HEIGHT.sight);
    expect(SHOT_HEIGHT.floor + at).toBeCloseTo(SHOT_HEIGHT.eye);
    expect(heightAfter(0, 0, 5)).toBeLessThan(0.3);
  });
  it('goes into the floor where the view meets it, and stays down there', () => {
    const pitch = -Math.atan(EYE_HEIGHT / 5);
    expect(aimDistance(pitch)).toBeCloseTo(5);
    expect(heightAfter(0, pitch, 2.5)).toBeLessThan(0);
    expect(heightAfter(0, pitch, 5)).toBeCloseTo(SHOT_HEIGHT.low - SHOT_HEIGHT.floor);
    expect(heightAfter(0, pitch, 9)).toBeCloseTo(SHOT_HEIGHT.low - SHOT_HEIGHT.floor);
    expect(SHOT_HEIGHT.low).toBeGreaterThan(0);
  });
  it('comes down from a jetpack to where the view meets the floor', () => {
    const pitch = -0.6, at = (SHOT_HEIGHT.eye + SHOT_HEIGHT.fly) / Math.tan(0.6);
    expect(heightAfter(SHOT_HEIGHT.fly, pitch, 0)).toBe(SHOT_HEIGHT.fly);
    expect(heightAfter(SHOT_HEIGHT.fly, pitch, at / 2)).toBeGreaterThan(0.8);
    expect(heightAfter(SHOT_HEIGHT.fly, pitch, at)).toBeCloseTo(SHOT_HEIGHT.low - SHOT_HEIGHT.floor);
  });
  it('stays up from a jetpack with a level look', () => {
    expect(heightAfter(SHOT_HEIGHT.fly, 0, 12)).toBeGreaterThanOrEqual(SHOT_HEIGHT.fly);
  });
  it('keeps the tilt within what a view can do', () => {
    expect(clampAimPitch(9)).toBeLessThan(Math.PI / 2);
    expect(clampAimPitch(-9)).toBeGreaterThan(-Math.PI / 2);
    expect(clampAimPitch(PITCH_UP)).toBe(PITCH_UP);
    expect(clampAimPitch(PITCH_DOWN)).toBe(PITCH_DOWN);
  });
});

const bolt = (s: SimState, a: Player, more: Partial<Projectile> = {}): Projectile => {
  const p: Projectile = { id: s.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...a.pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 5, until: s.tick + 600, hitIds: [], ownerId: a.id, ...more };
  s.projectiles.push(p);
  return p;
};
const fly = (s: SimState, ticks: number) => {
  for (let i = 0; i < ticks; i++) updateProjectiles(s);
};

describe('first person: a shot at nothing leaves along the view', () => {
  const alone = () => {
    const s = createSim(FLOORS.arena.map, 3);
    s.enemies = [];
    const a = s.players[0];
    a.pos = { x: s.map.w / 2 - 4.5, z: s.map.h / 2 + 0.5 };
    return { s, a };
  };

  it('up into the air with the view tilted up', () => {
    const { s, a } = alone();
    a.aimPitch = PITCH_UP;
    const p = bolt(s, a);
    fly(s, 10);
    const early = shotHeight(p);
    fly(s, 15);
    expect(early).toBeGreaterThan(0.5);
    expect(shotHeight(p)).toBeGreaterThan(early * 2);
  });

  it('into the floor ahead with the view tilted down', () => {
    const { s, a } = alone();
    a.aimPitch = -Math.atan(EYE_HEIGHT / 4);
    const p = bolt(s, a);
    fly(s, 25);
    expect(shotHeight(p)).toBeCloseTo(SHOT_HEIGHT.low - SHOT_HEIGHT.floor);
    // (it is still there: how far a shot reaches stays as it was)
    expect(s.projectiles).toContain(p);
  });

  it('as before for a player who looks from above', () => {
    const { s, a } = alone();
    const p = bolt(s, a);
    fly(s, 20);
    expect(shotHeight(p)).toBe(0);
    expect(p.arc).toMatchObject({ lift: 0, end: 0, reach: SHOT_HEIGHT.reach });
  });

  it('what is thrown lands where it is aimed, whatever the tilt', () => {
    const { s, a } = alone();
    a.aimPitch = PITCH_UP;
    const target = rel(a.pos, 4, 0);
    const p = bolt(s, a, { behavior: 'lob', kind: 'bomb', vel: { x: 0, z: 0 }, from: { ...a.pos }, target, launchedAt: s.tick, until: s.tick + 60, land: { radius: 2, damage: 10 } });
    fly(s, 1);
    expect(p.arc).toMatchObject({ lift: 0, end: 0, reach: 4 });
  });

  it('a pizza cutter stays on the floor', () => {
    const { s, a } = alone();
    a.aimPitch = PITCH_UP;
    const p = bolt(s, a, { behavior: 'saw', kind: 'pizzaCutter', bounces: 3, launchedAt: s.tick });
    fly(s, 20);
    expect(shotHeight(p)).toBe(0);
  });
});

describe('first person: a shot with a monster in its line of fire', () => {
  /** the player fires along +x at a tank `away` ahead, with the view tilted by `pitch` */
  const atMonster = (pitch: number, away: number) => {
    const s = createSim(FLOORS.arena.map, 3);
    s.enemies = [];
    const a = s.players[0];
    a.pos = { x: s.map.w / 2 - 4.5, z: s.map.h / 2 + 0.5 };
    const e = spawnEnemy(s, 'tank', rel(a.pos, away, 0));
    a.aimPitch = pitch;
    const p = bolt(s, a, { pierce: 0 });
    fly(s, 1);
    return { s, e, p, hp: e.hp };
  };

  it('flies to the monster when the view is about on it', () => {
    const { p } = atMonster(PITCH_START, 6);
    expect(p.arc).toMatchObject({ lift: 0, end: 0 });
    expect(p.arc!.reach).toBeCloseTo(6);
  });

  it('flies to the monster with the view on the floor in front of it', () => {
    const { p } = atMonster(-Math.atan(EYE_HEIGHT / 3), 6);
    expect(p.arc).toMatchObject({ lift: 0, end: 0 });
    expect(p.arc!.reach).toBeCloseTo(6);
  });

  it('goes up over it with the view up, and hits it all the same: monsters are hit at any height', () => {
    const { s, e, p, hp } = atMonster(PITCH_UP, 6);
    expect(p.arc!.end).toBeGreaterThan(SHOT_HEIGHT.fly);
    fly(s, 40);
    expect(e.hp).toBeLessThan(hp);
  });
});

const match = (players = 2) => {
  const s = createSim(FLOORS.arena.map, 3, { mode: 'versus', players, versus: { mode: 'ffa', rule: 'score' } });
  const mid = { x: s.map.w / 2 + 0.5, z: s.map.h / 2 + 0.5 };
  s.players.forEach((p, i) => (p.pos = i === 1 ? { ...mid } : { x: mid.x, z: mid.z + 5 }));
  for (const p of s.players) p.invulnUntil = 0;
  s.enemies = [];
  return s;
};
const hurt = (p: Player) => p.hp < p.maxHp;
/** the first player fires along +x from `back` behind the second, with the view tilted by `pitch` */
function shoot(s: SimState, pitch: number | undefined, back: number): Projectile {
  const [a, b] = s.players;
  a.pos = { x: b.pos.x - back, z: b.pos.z };
  if (pitch !== undefined) a.aimPitch = pitch;
  const p = bolt(s, a, { hitIds: [-1 - a.id] });
  fly(s, 60);
  return p;
}

describe('first person in versus', () => {
  it('a shot up into the air passes over a rival on the floor', () => {
    const s = match();
    shoot(s, PITCH_UP, 6);
    expect(hurt(s.players[1])).toBe(false);
  });

  it('a level look hits a rival on the floor', () => {
    const s = match();
    shoot(s, 0, 6);
    expect(hurt(s.players[1])).toBe(true);
  });

  it('looking down in front of a rival on the floor still hits them', () => {
    const s = match();
    const p = shoot(s, -Math.atan(EYE_HEIGHT / 3), 6);
    expect(hurt(s.players[1])).toBe(true);
    expect(p.arc).toMatchObject({ end: 0 });
  });

  it('a rival close by cannot be shot over: the shot is not up yet', () => {
    const s = match();
    shoot(s, PITCH_UP, 2);
    expect(hurt(s.players[1])).toBe(true);
  });

  it('a shot up at a rival on a jetpack hits', () => {
    const s = match();
    s.players[1].flying = true;
    const p = shoot(s, PITCH_UP, 5);
    expect(hurt(s.players[1])).toBe(true);
    expect(p.arc).toMatchObject({ end: SHOT_HEIGHT.fly });
  });

  it('a shot up over a rival on the floor goes to the flyer behind them', () => {
    const s = match(3);
    const [, b, c] = s.players;
    c.pos = { x: b.pos.x + 2, z: b.pos.z };
    c.flying = true;
    shoot(s, PITCH_UP, 5);
    expect(hurt(b)).toBe(false);
    expect(hurt(c)).toBe(true);
  });

  it('a shot up into the air hits a flyer who comes into its way', () => {
    const s = match();
    const [a, b] = s.players;
    a.pos = { x: b.pos.x - 8, z: b.pos.z };
    b.pos = { x: -50, z: -50 };
    a.aimPitch = PITCH_UP;
    bolt(s, a, { hitIds: [-1 - a.id] });
    fly(s, 1);
    b.pos = { x: a.pos.x + 8, z: a.pos.z };
    b.flying = true;
    fly(s, 60);
    expect(hurt(b)).toBe(true);
  });

  it('from a jetpack a level look passes over a rival on the floor, a look down at them hits', () => {
    const s = match();
    s.players[0].flying = true;
    shoot(s, 0, 5);
    expect(hurt(s.players[1])).toBe(false);
    const t = match();
    t.players[0].flying = true;
    shoot(t, -0.5, 5);
    expect(hurt(t.players[1])).toBe(true);
  });
});

describe('the tilt of the view reaches the game with the aim', () => {
  it('is kept with the player, and gone again with an aim from above', () => {
    const s = quietSim();
    const a = s.players[0];
    run(s, 1, () => [{ type: 'aim', playerId: 0, point: rel(a.pos, 0, -8), pitch: 0.3 }]);
    expect(a.aimPitch).toBe(0.3);
    run(s, 1);
    expect(a.aimPitch).toBe(0.3);
    run(s, 1, () => [aimAt(rel(a.pos, 0, -8))]);
    expect('aimPitch' in a).toBe(false);
  });

  it('a blaster fired with the view up sends its bolt up', () => {
    const s = quietSim();
    const a = s.players[0];
    run(s, 12, () => [{ type: 'aim', playerId: 0, point: rel(a.pos, 0, -8), pitch: PITCH_UP }, fireCmd]);
    const p = s.projectiles.find(x => x.ownerId === 0)!;
    expect(p).toBeDefined();
    expect(shotHeight(p)).toBeGreaterThan(0);
    expect(p.arc!.end).toBeGreaterThan(p.arc!.lift);
  });
});
