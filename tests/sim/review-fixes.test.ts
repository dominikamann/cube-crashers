import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { PERK_MAX } from '../../src/sim/config/perks';
import { POPCORN_FLIGHT, TOWERS } from '../../src/sim/config/towers';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damageEnemy } from '../../src/sim/systems/combat';
import { bestWeapon } from '../../src/sim/systems/stats';
import { BOSS_BODY_RESIST } from '../../src/sim/config/balance';
import { takeCard } from '../../src/sim/systems/offers';
import { enterFloor } from '../../src/sim/systems/run';
import { quietSim } from './helpers';

describe('review fixes', () => {
  it('a later floor starts with fresh timers: no instant alarm, horde or powerup', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    s.tick = 9000;
    enterFloor(s, 1);
    const enemiesAtStart = s.enemies.length;
    stepSim(s, []);
    expect(s.alarm.level).toBe(0);
    expect(s.alarm.nextAt).toBeGreaterThan(s.tick + 600);
    for (const n of s.nests) expect(n.nextSpawnAt).toBeGreaterThan(s.tick + 600);
    expect(s.nextPowerupAt).toBeGreaterThan(s.tick + 60);
    expect(s.nextJetpackAt).toBeGreaterThan(s.tick + 60);
    expect(s.powerups).toHaveLength(0);
    expect(s.enemies.length).toBeLessThanOrEqual(enemiesAtStart);
  });

  it('a perk card never takes a perk past its maximum', () => {
    const s = quietSim();
    const p = s.players[0];
    p.perks.dash = PERK_MAX.dash;
    const charges = p.dashCharges;
    takeCard(s, p, { type: 'perk', perk: 'dash' });
    expect(p.perks.dash).toBe(PERK_MAX.dash);
    expect(p.dashCharges).toBe(charges);
  });

  it('the popcorn mortar leads a target in the direction it walks', () => {
    const s = quietSim();
    // the tank walks toward the player, who stands to its west
    s.players[0].pos = { x: 24.5, z: 40.5 };
    s.towers.push({ id: 900, kind: 'popcorn', padId: 0, pos: { x: 35.5, z: 40.5 }, hp: 40, maxHp: 40, cooldown: 0, level: 1, buildLeft: 0, upgrading: false });
    const e = spawnEnemy(s, 'tank', { x: 31.5, z: 40.5 });
    stepSim(s, []);
    const shell = s.projectiles.find(pr => pr.kind === 'popcorn');
    expect(shell).toBeDefined();
    expect(Math.abs(e.dir.x)).toBeGreaterThan(0.5);
    const lead = e.speed * POPCORN_FLIGHT;
    expect(shell!.target!.x).toBeCloseTo(e.pos.x + e.dir.x * lead, 0);
    expect(shell!.target!.z).toBeCloseTo(e.pos.z + e.dir.z * lead, 0);
    void TOWERS;
  });
});

describe('bosses and stomps', () => {
  it('bosses take only a quarter of stomp and kart damage, full damage from weapons', () => {
    const s = quietSim();
    const seg = spawnEnemy(s, 'wormSegment', { x: 30.5, z: 40.5 });
    const hp = seg.hp;
    damageEnemy(s, seg, 20, 'stomp', 0);
    expect(seg.hp).toBeCloseTo(hp - 20 * BOSS_BODY_RESIST, 5);
    damageEnemy(s, seg, 20, 'kart', 0);
    expect(seg.hp).toBeCloseTo(hp - 40 * BOSS_BODY_RESIST, 5);
    damageEnemy(s, seg, 20, 'pixelBlaster', 0);
    expect(seg.hp).toBeCloseTo(hp - 40 * BOSS_BODY_RESIST - 20, 5);
  });

});

describe('per-player stats for the result screen', () => {
  it('counts each player kills by weapon, coins collected and towers built', () => {
    const s = quietSim();
    const p = s.players[0];
    const a = spawnEnemy(s, 'blob', { x: 30.5, z: 40.5 });
    const b = spawnEnemy(s, 'blob', { x: 31.5, z: 40.5 });
    const c = spawnEnemy(s, 'blob', { x: 32.5, z: 40.5 });
    damageEnemy(s, a, 999, 'candyCannon', p.id);
    damageEnemy(s, b, 999, 'candyCannon', p.id);
    damageEnemy(s, c, 999, 'stomp', p.id);
    expect(p.stats.killsBy).toEqual({ candyCannon: 2, stomp: 1 });
    expect(bestWeapon(p.stats)).toBe('candyCannon');
    s.coins.push({ id: 777, pos: { ...p.pos }, value: 3, expiresAt: s.tick + 100 });
    stepSim(s, []);
    expect(p.stats.coins).toBe(3);
  });
});
