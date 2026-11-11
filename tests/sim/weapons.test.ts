import { describe, expect, it } from 'vitest';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damageEnemy } from '../../src/sim/systems/combat';
import { stepSim } from '../../src/sim/sim';
import { quietSim, run } from './helpers';

describe('pixel blaster', () => {
  it('kills a blob in front of the player and the coin gets collected', () => {
    const s = quietSim();
    const p = s.players[0];
    spawnEnemy(s, 'blob', { x: p.pos.x, z: p.pos.z - 3 });
    const events = run(s, 120);
    expect(events.some(e => e.type === 'enemyKilled' && e.kind === 'blob')).toBe(true);
    expect(events.some(e => e.type === 'shot' && e.weapon === 'pixelBlaster')).toBe(true);
    run(s, 60, () => [{ type: 'move', playerId: 0, dir: { x: 0, z: -1 } }]);
    expect(p.coins).toBe(1);
  });
});

describe('coins', () => {
  it('counts a streak for pickups within 30 ticks', () => {
    const s = quietSim();
    const p = s.players[0];
    s.coins.push({ id: s.nextId++, pos: { ...p.pos }, value: 1, expiresAt: 1e9 });
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'coinPicked', playerId: 0, streak: 1 });
    run(s, 9);
    s.coins.push({ id: s.nextId++, pos: { ...p.pos }, value: 1, expiresAt: 1e9 });
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'coinPicked', playerId: 0, streak: 2 });
    run(s, 40);
    s.coins.push({ id: s.nextId++, pos: { ...p.pos }, value: 1, expiresAt: 1e9 });
    stepSim(s, []);
    expect(s.events).toContainEqual({ type: 'coinPicked', playerId: 0, streak: 1 });
    expect(p.coins).toBe(3);
  });

  it('pulls coins inside the magnet radius', () => {
    const s = quietSim();
    const p = s.players[0];
    s.coins.push({ id: s.nextId++, pos: { x: p.pos.x + 2.2, z: p.pos.z }, value: 1, expiresAt: 1e9 });
    run(s, 30);
    expect(p.coins).toBe(1);
  });
});

describe('laser sword', () => {
  it('hits every enemy inside its radius with one swing', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'laserSword', level: 1, cooldown: 0 }];
    const es = [
      spawnEnemy(s, 'blob', { x: p.pos.x + 1, z: p.pos.z }),
      spawnEnemy(s, 'blob', { x: p.pos.x - 1, z: p.pos.z }),
      spawnEnemy(s, 'blob', { x: p.pos.x, z: p.pos.z - 1.5 }),
    ];
    es.forEach(e => (e.speed = 0));
    stepSim(s, []);
    expect(es.map(e => e.hp)).toEqual([2, 2, 2]);
  });
});

describe('splitter', () => {
  it('spawns two splitlings when killed', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'splitter', { x: s.players[0].pos.x, z: s.players[0].pos.z - 12 });
    s.players[0].weapons = [];
    damageEnemy(s, e, 100, 'pixelBlaster');
    stepSim(s, []);
    expect(s.enemies.filter(x => x.kind === 'splitling')).toHaveLength(2);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
  });
});
