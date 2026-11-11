import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { quietSim, run } from './helpers';

function downedPlayer() {
  const s = quietSim();
  const p = s.players[0];
  p.weapons = [];
  p.coins = 40;
  const tank = spawnEnemy(s, 'tank', { ...p.pos });
  tank.speed = 0;
  const events = run(s, 250);
  return { s, p, tank, events };
}

describe('player damage', () => {
  it('goes down after 4 s inside a tank and loses 25 % of coins', () => {
    const { p, events } = downedPlayer();
    expect(events.some(e => e.type === 'playerHit')).toBe(true);
    expect(events.filter(e => e.type === 'playerDown')).toHaveLength(1);
    expect(p.downUntil).not.toBeNull();
    expect(p.coins).toBe(30);
  });

  it('cannot move or shoot while down', () => {
    const { s, p, tank } = downedPlayer();
    s.enemies = s.enemies.filter(e => e.id !== tank.id);
    p.weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }];
    spawnEnemy(s, 'blob', { x: p.pos.x, z: p.pos.z - 3 }).speed = 0;
    const x0 = p.pos.x;
    stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(p.pos.x).toBe(x0);
    expect(s.events.some(e => e.type === 'shot')).toBe(false);
  });

  it('respawns after 3 s with full hp, at spawn, keeping weapons', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = [{ kind: 'discoBall', level: 3, cooldown: 0 }];
    p.hp = 1;
    p.pos = { x: 4, z: 0 };
    const tank = spawnEnemy(s, 'tank', { ...p.pos });
    tank.speed = 0;
    tank.hp = 1e9;
    let downAt = -1;
    let respawnAt = -1;
    for (let i = 0; i < 400 && respawnAt < 0; i++) {
      stepSim(s, []);
      if (s.events.some(e => e.type === 'playerDown')) downAt = s.tick;
      if (s.events.some(e => e.type === 'playerRespawn')) respawnAt = s.tick;
    }
    expect(respawnAt - downAt).toBe(180);
    expect(p.hp).toBe(100);
    expect(p.pos).toEqual(s.map.playerSpawn);
    expect(p.weapons).toEqual([expect.objectContaining({ kind: 'discoBall', level: 3 })]);
  });
});
