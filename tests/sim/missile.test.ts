import { describe, expect, it } from 'vitest';
import { RARE } from '../../src/sim/config/rare';
import { FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_WALKER, hasLos, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { locked } from '../../src/sim/systems/missile';
import type { Command, SimState } from '../../src/sim/types';
import { quietSim, run } from './helpers';

const M = RARE.missile;

function armed(s: SimState, id = 0) {
  const p = s.players.find(x => x.id === id)!;
  p.rare = { kind: 'missileLauncher', until: s.tick + 1e6, cooldown: 0 };
  p.rareSelected = true;
  return p;
}

describe('the Lock-On Launcher', () => {
  it('locks on to what stays near the crosshair, and only then fires', () => {
    const s = quietSim();
    const p = armed(s);
    const e = spawnEnemy(s, 'tank', { x: p.pos.x + 6, z: p.pos.z });
    e.speed = 0;
    const aim: Command = { type: 'aim', playerId: 0, point: { ...e.pos } };
    const fire: Command = { type: 'fire', playerId: 0 };
    run(s, 5, () => [aim, fire]);
    // (not locked yet: nothing flies)
    expect(locked(p)).toBe(false);
    expect(s.projectiles).toHaveLength(0);
    run(s, M.lockTicks, () => [aim]);
    expect(locked(p)).toBe(true);
    expect(p.lock).toMatchObject({ id: e.id, rival: false });
    stepSim(s, [aim, fire]);
    expect(s.projectiles.map(x => x.behavior)).toEqual(['missile']);
    // (the next one needs a new lock)
    expect(locked(p)).toBe(false);
  });

  it('loses the lock when the crosshair leaves the target', () => {
    const s = quietSim();
    const p = armed(s);
    const e = spawnEnemy(s, 'tank', { x: p.pos.x + 6, z: p.pos.z });
    e.speed = 0;
    run(s, M.lockTicks + 2, () => [{ type: 'aim', playerId: 0, point: { ...e.pos } }]);
    expect(locked(p)).toBe(true);
    run(s, 2, () => [{ type: 'aim', playerId: 0, point: { x: p.pos.x - 6, z: p.pos.z } }]);
    expect(p.lock).toBeUndefined();
  });

  it('its missile turns after a target that is not where it was aimed, and blows up on it', () => {
    const s = quietSim();
    const p = armed(s);
    const e = spawnEnemy(s, 'tank', { x: p.pos.x + 7, z: p.pos.z });
    e.speed = 0;
    const hp = e.hp;
    run(s, M.lockTicks + 1, () => [{ type: 'aim', playerId: 0, point: { ...e.pos } }]);
    stepSim(s, [{ type: 'fire', playerId: 0 }]);
    // the target is somewhere else now: off to the side
    e.pos = { x: p.pos.x + 5, z: p.pos.z + 4 };
    const events = run(s, 200);
    expect(s.projectiles).toHaveLength(0);
    expect(events.some(x => x.type === 'explosion')).toBe(true);
    expect(e.hp).toBeLessThan(hp);
  });

  it('in a versus match it goes for a rival and takes them out', () => {
    const s = createSim(FLOORS.neon.map, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    s.countdown = 0;
    s.enemies = [];
    s.crates = [];
    const [a, b] = s.players;
    // (somewhere near with a free line between the two)
    b.pos = [[5, 0], [-5, 0], [0, 5], [0, -5]].map(([dx, dz]) => ({ x: a.pos.x + dx, z: a.pos.z + dz })).find(at => isFree(s.map, at, 0.4, BLOCKS_WALKER) && hasLos(s.map, a.pos, at))!;
    b.invulnUntil = 0;
    const p = armed(s, a.id);
    const aim = (): Command[] => [{ type: 'aim', playerId: a.id, point: { ...b.pos } }];
    run(s, M.lockTicks + 1, aim);
    expect(p.lock).toMatchObject({ id: b.id, rival: true });
    stepSim(s, [...aim(), { type: 'fire', playerId: a.id }]);
    const events = run(s, 120);
    expect(events.some(e => e.type === 'pvpKill' && e.victimId === b.id && e.killerId === a.id)).toBe(true);
  });

  it('whose target falls to someone else gives up on them: it does not chase them again after their respawn', () => {
    const s = createSim(FLOORS.neon.map, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    s.countdown = 0;
    s.enemies = [];
    s.crates = [];
    const [a, b] = s.players;
    s.projectiles.push({ id: s.nextId++, kind: 'missileLauncher', behavior: 'missile', pos: { ...a.pos }, vel: { x: M.speed, z: 0 }, damage: M.damage, pierce: 0, until: s.tick + M.lifeTicks, hitIds: [], ownerId: a.id, launchedAt: s.tick, seek: { id: b.id, rival: true } });
    // the target is down for a moment (someone else got them), then back
    b.downUntil = s.tick + 5;
    stepSim(s, []);
    b.downUntil = null;
    stepSim(s, []);
    expect(s.projectiles.find(x => x.behavior === 'missile')?.seek).toBeUndefined();
  });
});
