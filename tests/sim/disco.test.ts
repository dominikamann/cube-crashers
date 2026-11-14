import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { DISCO } from '../../src/sim/config/weapons';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { quietSim, rel } from './helpers';

const fire = { type: 'fire' as const, playerId: 0 };

describe('disco ball', () => {
  it('reaches monsters up to seven tiles away', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'discoBall', level: 1, cooldown: 0 }];
    p.selected = 0;
    expect(DISCO.range).toBeGreaterThanOrEqual(7);
    const e = spawnEnemy(s, 'tank', rel(p.pos, 6.5, 0));
    e.speed = 0;
    const hp = e.hp;
    stepSim(s, [fire]);
    expect(e.hp).toBeLessThan(hp);
  });

  it('with nothing in reach it still goes off: you see it, and it reloads', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'discoBall', level: 1, cooldown: 0 }];
    p.selected = 0;
    stepSim(s, [fire]);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'shot', weapon: 'discoBall' }));
    expect(p.weapons[0].cooldown).toBeGreaterThan(0);
  });

  it('tells whom its beams hit and where they stood: the nearest in reach, no more than it has beams', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'discoBall', level: 1, cooldown: 0 }];
    p.selected = 0;
    const near = [1, 2, 3, 4, 5, 6].map(d => spawnEnemy(s, 'tank', rel(p.pos, d, 0)));
    const far = spawnEnemy(s, 'tank', rel(p.pos, 0, DISCO.range + 2));
    for (const e of [...near, far]) e.speed = 0;
    stepSim(s, [fire]);
    const zap = s.events.find(e => e.type === 'discoZap');
    expect(zap).toMatchObject({ playerId: p.id, pos: p.pos, enemies: near.slice(0, DISCO.targets).map(e => e.id), rivals: [] });
    if (zap?.type !== 'discoZap') throw new Error('no zap');
    expect(zap.at).toEqual(near.slice(0, DISCO.targets).map(e => e.pos));
    // exactly those took the hit
    for (const e of near) expect(e.hp < e.maxHp).toBe(zap.enemies.includes(e.id));
    expect(far.hp).toBe(far.maxHp);
  });

  it('with nobody in reach its beams go nowhere', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'discoBall', level: 1, cooldown: 0 }];
    p.selected = 0;
    stepSim(s, [fire]);
    expect(s.events).toContainEqual({ type: 'discoZap', playerId: p.id, pos: p.pos, enemies: [], rivals: [], at: [] });
  });

  it('in versus it hits rivals too', () => {
    const s = createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule: 'score' } });
    const [me, rival] = s.players;
    me.pos = { x: 35.5, z: 18.5 };
    rival.pos = { x: 39.5, z: 18.5 };
    rival.invulnUntil = 0;
    me.weapons = [{ kind: 'discoBall', level: 1, cooldown: 0 }];
    me.selected = 0;
    const hp = rival.hp;
    stepSim(s, [{ type: 'fire', playerId: me.id }]);
    expect(rival.hp).toBeLessThan(hp);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'discoZap', playerId: me.id, rivals: [rival.id] }));
  });
});
