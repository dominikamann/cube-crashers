import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { POWERUP } from '../../src/sim/systems/powerups';
import type { PowerupKind, SimState } from '../../src/sim/types';
import { aimAt, fire, quietSim, rel, run } from './helpers';

function pick(kind: PowerupKind, prepare: (s: SimState) => void = () => {}): SimState {
  const s = quietSim();
  prepare(s);
  s.powerups.push({ id: s.nextId++, kind, pos: { ...s.players[0].pos }, expiresAt: 1e9 });
  stepSim(s, []);
  expect(s.events).toContainEqual({ type: 'powerupPicked', kind, playerId: 0 });
  expect(s.powerups).toHaveLength(0);
  return s;
}

describe('power-ups', () => {
  it('appear on a power spot every 30 seconds and vanish after 15', () => {
    const s = quietSim();
    s.nextPowerupAt = 10;
    const events = run(s, 12);
    expect(s.powerups).toHaveLength(1);
    const pu = s.powerups[0];
    expect(s.map.powerSpots.some(sp => sp.x === pu.pos.x && sp.z === pu.pos.z)).toBe(true);
    expect(events.some(e => e.type === 'powerupSpawned' && e.kind === pu.kind)).toBe(true);
    expect(s.nextPowerupAt).toBe(10 + POWERUP.intervalTicks);
    run(s, POWERUP.lifetimeTicks);
    expect(s.powerups).toHaveLength(0);
  });

  it('are scheduled on a fresh floor together with two karts', () => {
    const s = createSim(floor01, 2);
    expect(s.vehicles).toHaveLength(2);
    expect(s.nextPowerupAt).toBeGreaterThan(0);
    expect(s.nextPowerupAt).toBeLessThan(POWERUP.intervalTicks);
  });

  it('magnet pulls in every coin on the floor', () => {
    const s = pick('magnet', q => {
      q.coins.push({ id: q.nextId++, pos: rel(q.players[0].pos, -18, 0), value: 1, expiresAt: q.tick + 5 });
    });
    run(s, 120);
    expect(s.players[0].coins).toBe(1);
  });

  it('rapid fire doubles the rate of fire', () => {
    const count = (s: SimState) => run(s, 240, () => [aimAt(rel(s.players[0].pos, 0, -3)), fire]).filter(e => e.type === 'shot').length;
    const normal = count(quietSim());
    const rapid = count(pick('rapid'));
    expect(rapid).toBeGreaterThan(normal * 1.8);
  });

  it('bomb clears everything within 8 tiles', () => {
    const s = pick('bomb', q => {
      spawnEnemy(q, 'tank', rel(q.players[0].pos, 6, 0)).speed = 0;
      spawnEnemy(q, 'tank', rel(q.players[0].pos, -7.5, 0)).speed = 0;
    });
    expect(s.enemies).toHaveLength(0);
    expect(s.players[0].hp).toBe(100);
  });

  it('frost slows every enemy for 5 seconds', () => {
    const s = pick('frost', q => {
      spawnEnemy(q, 'blob', { x: 15.5, z: 5.5 });
    });
    expect(s.enemies[0].slowUntil - s.tick).toBeGreaterThan(290);
  });

  it('heart heals 50, up to full health', () => {
    expect(pick('heart', q => (q.players[0].hp = 30)).players[0].hp).toBe(80);
    expect(pick('heart', q => (q.players[0].hp = 80)).players[0].hp).toBe(100);
  });
});
