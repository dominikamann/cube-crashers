import { describe, expect, it } from 'vitest';
import { BOSS_HP } from '../../src/sim/config/balance';
import { damageEnemy, hitEnemy } from '../../src/sim/systems/combat';
import { spawnBoss } from '../../src/sim/systems/boss';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { run, quietSim } from '../sim/helpers';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim } from '../../src/sim/sim';
import { enterFloor } from '../../src/sim/systems/run';
import { ALL_WEAPONS, BOSSES, DIFFICULTIES, LEVELS, bossHealth, weaponDps } from './measure';

/**
 * How long a boss lives, from the game's own numbers: its health against what a weapon deals to a boss when
 * every shot hits and the trigger is never let go. A real player needs about a quarter longer.
 */
const dps = Object.fromEntries(ALL_WEAPONS.map(w => [w, LEVELS.map(l => weaponDps(w, l))]));
const blaster = (level: number) => dps.pixelBlaster[level - 1];
const FLOOR_BOSSES = BOSSES.filter(b => b !== 'dominik');

describe('how long a boss lives', () => {
  it('a floor boss takes a well-armed player on Medium most of a minute', () => {
    for (const b of ['megaBlock', 'kraken'] as const) {
      for (const level of [3, 4, 5]) {
        const seconds = bossHealth(b, { level }) / blaster(level);
        expect(seconds, `${b}, level ${level}`).toBeGreaterThan(40);
        expect(seconds, `${b}, level ${level}`).toBeLessThan(85);
      }
    }
  });

  it('no boss falls in under half a minute to a maxed Pixel Blaster, on any difficulty', () => {
    for (const d of DIFFICULTIES) for (const b of FLOOR_BOSSES) expect(bossHealth(b, { difficulty: d, level: 5 }) / blaster(5), `${b} on ${d}`).toBeGreaterThanOrEqual(30);
  });

  it('the boss of the last floor of a Tower Run lasts about twice as long', () => {
    const seconds = bossHealth('worm', { level: 5, final: true }) / blaster(5);
    expect(seconds).toBeGreaterThan(80);
    expect(seconds).toBeLessThan(150);
    expect(bossHealth('worm', { final: true })).toBeCloseTo(bossHealth('worm') * BOSS_HP.final, 5);
  });

  it('a better weapon always beats a boss sooner, although the boss is tougher for it', () => {
    for (const w of ALL_WEAPONS) {
      if (dps[w][0] === 0) continue;
      for (let level = 2; level <= 5; level++) {
        const before = bossHealth('megaBlock', { level: level - 1 }) / dps[w][level - 2];
        const after = bossHealth('megaBlock', { level }) / dps[w][level - 1];
        expect(after, `${w} at level ${level}`).toBeLessThan(before);
      }
    }
  });

  it('the Pixel Blaster grows evenly with its levels', () => {
    const steps = [2, 3, 4, 5].map(l => blaster(l) / blaster(l - 1));
    for (const s of steps) {
      expect(s).toBeGreaterThan(1.2);
      expect(s).toBeLessThan(1.45);
    }
    expect(blaster(5) / blaster(1)).toBeCloseTo(3, 1);
  });

  it('a boss is tougher for every player in the team, by most of a player', () => {
    const solo = bossHealth('megaBlock');
    expect(bossHealth('megaBlock', { players: 2 })).toBeCloseTo(solo * (1 + BOSS_HP.teamStep), 5);
    expect(bossHealth('megaBlock', { players: 4 }) / solo).toBeGreaterThan(3);
  });

  it('a wild boss is smaller than the real one, but no pushover', () => {
    const share = bossHealth('rhino', { wild: true }) / bossHealth('rhino');
    expect(share).toBeGreaterThanOrEqual(0.6);
    expect(share).toBeLessThan(1);
  });
});

describe('a boss cannot be burst down', () => {
  it('takes at most a small share of its health a second in full, the rest of a burst only in part', () => {
    const s = quietSim();
    spawnBoss(s, 'megaBlock');
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body.speed = 0;
    s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
    const max = s.boss!.maxHp;
    // one enormous hit: what the boss lets through in full, and a part of the rest
    damageEnemy(s, body, max, 'bomb', 0);
    const free = max * BOSS_HP.gate.share * BOSS_HP.gate.bank;
    expect(max - body.hp).toBeCloseTo(free + (max - free) * BOSS_HP.gate.excess, 3);
    expect(body.hp).toBeGreaterThan(0);
  });

  it('the last boss of a run takes no more a second in full than it would with single health', () => {
    const s = createSim(floor01, 3, { mode: 'run' });
    s.run.bosses = undefined;
    enterFloor(s, s.run.floors.length - 1);
    const b = s.boss!;
    expect(b.gateShare).toBeCloseTo(BOSS_HP.gate.share / BOSS_HP.final, 6);
    const body = s.enemies.find(e => b.worms[0].includes(e.id))!;
    const before = body.hp;
    damageEnemy(s, body, 1e6, 'bomb', 0);
    // (one segment takes what the whole worm lets through)
    const free = b.maxHp * b.gateShare! * BOSS_HP.gate.bank;
    expect(free).toBeLessThan(before);
    expect(body.hp).toBeLessThanOrEqual(0);
    expect(s.boss!.gate).toBeCloseTo(0, 6);
  });

  it('a steady weapon below that share deals its damage in full', () => {
    const s = quietSim();
    spawnBoss(s, 'megaBlock');
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body.speed = 0;
    s.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
    const perTick = (s.boss!.maxHp * BOSS_HP.gate.share) / 60 / 2;
    const before = body.hp;
    for (let i = 0; i < 120; i++) {
      damageEnemy(s, body, perTick, 'pixelBlaster', 0);
      run(s, 1);
    }
    expect(before - body.hp).toBeCloseTo(perTick * 120, 3);
  });

  it('common monsters take every hit in full', () => {
    const s = quietSim();
    const tank = spawnEnemy(s, 'tank', { x: 31.5, z: 50 });
    damageEnemy(s, tank, tank.maxHp - 1, 'bomb', 0);
    expect(tank.hp).toBeCloseTo(1, 5);
  });

  it('the bonus for hits from up close is for monsters, not for a boss you cannot help standing next to', () => {
    const s = quietSim();
    const p = s.players[0];
    spawnBoss(s, 'megaBlock');
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    body.pos = { x: p.pos.x + 2.7, z: p.pos.z };
    hitEnemy(s, body, 10, 'pixelBlaster', p.id);
    expect(body.maxHp - body.hp).toBeCloseTo(10, 5);
    const blob = spawnEnemy(s, 'tank', { x: p.pos.x - 1, z: p.pos.z });
    hitEnemy(s, blob, 10, 'pixelBlaster', p.id);
    expect(blob.maxHp - blob.hp).toBeCloseTo(15, 5);
  });
});
