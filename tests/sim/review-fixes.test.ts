import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { PERK_MAX } from '../../src/sim/config/perks';
import { POPCORN_FLIGHT, TOWERS } from '../../src/sim/config/towers';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damageEnemy, explode } from '../../src/sim/systems/combat';
import { bestWeapon } from '../../src/sim/systems/stats';
import { BOSS_BODY_RESIST, STOMP_DAMAGE } from '../../src/sim/config/balance';
import { updateTowers } from '../../src/sim/systems/towers';
import { takeCard } from '../../src/sim/systems/offers';
import { enterFloor } from '../../src/sim/systems/run';
import { bossHp, bossScale } from '../../src/sim/systems/boss';
import { ENEMIES } from '../../src/sim/config/enemies';
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

describe('blasts on the Segment Worm', () => {
  const segmentsHurt = (setup: (s: ReturnType<typeof quietSim>) => void) => {
    const s = quietSim();
    const segs = Array.from({ length: 6 }, (_, i) => spawnEnemy(s, 'wormSegment', { x: 30.5 + i * 0.4, z: 40.5 }));
    const before = segs.reduce((n, e) => n + e.hp, 0);
    setup(s);
    return before - segs.reduce((n, e) => n + e.hp, 0);
  };

  it('a Tesla bolt does not jump along the worm, a bumper and a stomp share their hit', () => {
    const tower = (kind: 'tesla' | 'bumper') => (s: ReturnType<typeof quietSim>) => {
      s.players[0].pos = { x: 10.5, z: 10.5 };
      s.towers.push({ id: 900, kind, padId: 0, pos: { x: 31.5, z: 42 }, hp: 40, maxHp: 40, cooldown: 0, level: 1, buildLeft: 0, upgrading: false });
      updateTowers(s);
    };
    expect(segmentsHurt(tower('tesla'))).toBeLessThanOrEqual(TOWERS.tesla.damage + 1e-6);
    expect(segmentsHurt(tower('bumper'))).toBeLessThanOrEqual(TOWERS.bumper.damage + 1e-6);
    const stomped = segmentsHurt(s => {
      s.players[0].pos = { x: 31.5, z: 40.5 };
      s.players[0].air = 1;
      stepSim(s, []);
    });
    expect(stomped).toBeGreaterThan(0);
    expect(stomped).toBeLessThanOrEqual(STOMP_DAMAGE * BOSS_BODY_RESIST + 1e-6);
  });

  it('the worm starts with a full bar: its health counts what the segments really have', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    // (which boss ends a run goes by the seed: the roof's own one here)
    s.run.bosses = undefined;
    enterFloor(s, 4);
    expect(s.boss?.kind).toBe('worm');
    expect(bossHp(s)).toBeCloseTo(s.boss!.maxHp, 5);
    // 18 segments on medium for one player, on the last floor: the bar is not counted twice or left unscaled
    expect(s.boss!.maxHp).toBeCloseTo(18 * ENEMIES.wormSegment.hp * bossScale(s), 5);
    expect(s.boss!.phase).toBe(1);
  });

  it('a blast over many segments shares its damage: the worm takes it about once, not once per segment', () => {
    const s = quietSim();
    const segs = Array.from({ length: 8 }, (_, i) => spawnEnemy(s, 'wormSegment', { x: 30.5 + i * 0.4, z: 40.5 }));
    const before = segs.reduce((n, e) => n + e.hp, 0);
    explode(s, { x: 31.9, z: 40.5 }, 3, { enemy: 50 }, 'explosion', 0);
    const taken = before - segs.reduce((n, e) => n + e.hp, 0);
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThanOrEqual(50 + 1e-6);
    // a blast on a single ordinary monster still hits in full
    const blob = spawnEnemy(s, 'tank', { x: 20.5, z: 40.5 });
    const hp = blob.hp;
    explode(s, blob.pos, 1, { enemy: 50 }, 'explosion', 0);
    expect(hp - blob.hp).toBe(50);
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

describe('solid bosses', () => {
  it('a player cannot stand inside the Mega Block: it pushes them out to its edge', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    // the third floor is the arena or the sea bed, by the seed: take the arena
    s.run.floors[2] = 'arena';
    s.run.bosses = undefined;
    enterFloor(s, 2);
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    const p = s.players[0];
    p.pos = { x: boss.pos.x + 0.2, z: boss.pos.z };
    stepSim(s, []);
    expect(Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z)).toBeGreaterThan(boss.radius);
  });

  it('the Mega Block keeps you outside its corners too (in first person you never look inside it), and touching it still hurts', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    s.run.floors[2] = 'arena';
    s.run.bosses = undefined;
    enterFloor(s, 2);
    const boss = s.enemies.find(e => e.kind === 'megaBlock')!;
    boss.speed = 0;
    const p = s.players[0];
    p.invulnUntil = 0;
    // walking into a corner of the block: half its diagonal is 2.26
    p.pos = { x: boss.pos.x + 1.4, z: boss.pos.z + 1.4 };
    const hp = p.hp;
    stepSim(s, []);
    expect(Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z)).toBeGreaterThan(2.5);
    stepSim(s, []);
    expect(p.hp).toBeLessThan(hp);
  });

  it('nor inside the Kraken', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    s.run.floors[2] = 'underwater';
    s.run.bosses = undefined;
    enterFloor(s, 2);
    const boss = s.enemies.find(e => e.kind === 'kraken')!;
    const p = s.players[0];
    p.pos = { x: boss.pos.x + 0.2, z: boss.pos.z };
    stepSim(s, []);
    expect(Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z)).toBeGreaterThan(boss.radius);
  });
});
