import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim } from '../../src/sim/sim';
import { updateProjectiles } from '../../src/sim/systems/combat';
import { shotHeight, SHOT_HEIGHT } from '../../src/sim/systems/shot-height';
import type { Player, SimState } from '../../src/sim/types';

const match = (players = 2) => {
  const s = createSim(FLOORS.arena.map, 3, { mode: 'versus', players, versus: { mode: 'ffa', rule: 'score' } });
  // the rival stands in the middle of the open arena, anyone else far from the line of fire
  const mid = { x: s.map.w / 2 + 0.5, z: s.map.h / 2 + 0.5 };
  s.players.forEach((p, i) => (p.pos = i === 1 ? { ...mid } : { x: mid.x, z: mid.z + 5 }));
  return s;
};

/** the first player fires along +x from `back` behind the second, and the shot flies until it is past them */
function fire(s: SimState, back = 3): void {
  const [a, b] = s.players;
  for (const p of s.players) p.invulnUntil = 0;
  s.enemies = [];
  a.pos = { x: b.pos.x - back, z: b.pos.z };
  s.projectiles.push({ id: s.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...a.pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 5, until: s.tick + 600, hitIds: [-1 - a.id], ownerId: a.id });
  for (let i = 0; i < 40; i++) updateProjectiles(s);
}
const hurt = (p: Player) => p.hp < p.maxHp;

describe('shots have a height', () => {
  it('from the floor a shot goes up to a rival on a jetpack and hits', () => {
    const s = match();
    s.players[1].flying = true;
    fire(s);
    expect(hurt(s.players[1])).toBe(true);
  });

  it('between two flyers it stays up', () => {
    const s = match();
    s.players[0].flying = true;
    s.players[1].flying = true;
    fire(s);
    expect(hurt(s.players[1])).toBe(true);
    expect(shotHeight(s.projectiles[0] ?? { arc: { x: 0, z: 0, lift: 2.5, end: 2.5, reach: 1 }, pos: { x: 0, z: 0 } } as never)).toBe(SHOT_HEIGHT.fly);
  });

  it('from a jetpack it comes down onto a rival on the floor', () => {
    const s = match();
    s.players[0].flying = true;
    fire(s);
    expect(hurt(s.players[1])).toBe(true);
  });

  it('a jump takes a rival over a shot on the floor', () => {
    const s = match();
    s.players[1].air = 1000;
    fire(s);
    expect(hurt(s.players[1])).toBe(false);
  });

  it('a shot at a rival on the floor passes under a flyer who comes into its way', () => {
    const s = match(3);
    const [, target, flyer] = s.players;
    fire(s, 6);
    expect(hurt(target)).toBe(true);
    // the same again, and this time someone flies into the line of fire after the shot is on its way
    const t = match(3);
    for (const p of t.players) p.invulnUntil = 0;
    t.enemies = [];
    const [a, b, c] = t.players;
    a.pos = { x: b.pos.x - 6, z: b.pos.z };
    c.pos = { x: -50, z: -50 };
    t.projectiles.push({ id: t.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...a.pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 5, until: t.tick + 600, hitIds: [-1 - a.id], ownerId: a.id });
    updateProjectiles(t);
    c.pos = { x: b.pos.x - 3, z: b.pos.z };
    c.flying = true;
    for (let i = 0; i < 40; i++) updateProjectiles(t);
    expect(hurt(c)).toBe(false);
    expect(hurt(b)).toBe(true);
    void flyer;
  });

  it('a shot up at a flyer passes over a rival on the floor behind them', () => {
    const s = match(3);
    const [a, b, c] = s.players;
    b.flying = true;
    fire(s, 3);
    void a;
    expect(hurt(b)).toBe(true);
    // (the third player stands further along the line, on the floor)
    const t = match(3);
    const [, f, g] = t.players;
    f.flying = true;
    for (const p of t.players) p.invulnUntil = 0;
    t.enemies = [];
    t.players[0].pos = { x: f.pos.x - 3, z: f.pos.z };
    g.pos = { x: f.pos.x + 1.5, z: f.pos.z };
    t.projectiles.push({ id: t.nextId++, kind: 'pixelBlaster', behavior: 'bolt', pos: { ...t.players[0].pos }, vel: { x: 12, z: 0 }, damage: 10, pierce: 5, until: t.tick + 600, hitIds: [], ownerId: t.players[0].id });
    for (let i = 0; i < 40; i++) updateProjectiles(t);
    expect(hurt(f)).toBe(true);
    expect(hurt(g)).toBe(false);
    void c;
  });
});
