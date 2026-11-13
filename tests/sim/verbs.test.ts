import { describe, expect, it } from 'vitest';
import { stepSim } from '../../src/sim/sim';
import { comboMult, damageEnemy, coinValue } from '../../src/sim/systems/combat';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { damagePlayer } from '../../src/sim/systems/player';
import { dash, jump, move, quietSim, rel, run } from './helpers';
import { ENEMIES } from '../../src/sim/config/enemies';
import { DASH_DAMAGE, STOMP_DAMAGE } from '../../src/sim/config/balance';

describe('jump', () => {
  it('high in the jump no monster reaches you, and the landing stomps', () => {
    const s = quietSim();
    const p = s.players[0];
    const tank = spawnEnemy(s, 'tank', rel(p.pos, 0.3, 0));
    stepSim(s, [jump]);
    expect(s.events).toContainEqual({ type: 'jump', playerId: 0 });
    let landedAt = -1;
    for (let i = 0; i < 40 && landedAt < 0; i++) {
      // the top of the jump is safe (taking off and landing are not, see stomp-balance.test.ts)
      const hp = p.hp;
      const high = p.air > 8 && p.air < 22;
      stepSim(s, []);
      if (s.events.some(e => e.type === 'stomp')) landedAt = s.tick;
      else if (high) expect(p.hp).toBe(hp);
    }
    expect(landedAt).toBeGreaterThan(25);
    expect(landedAt).toBeLessThan(35);
    expect(tank.hp).toBe(ENEMIES.tank.hp - STOMP_DAMAGE);
  });

  it('crosses glitch floor without damage, walking through it hurts', () => {
    const walker = quietSim();
    walker.players[0].pos = { x: 33.5, z: 15.5 };
    run(walker, 30, () => [move(1, 0)]);
    expect(walker.players[0].hp).toBeLessThan(100);

    const jumper = quietSim();
    jumper.players[0].pos = { x: 33.5, z: 15.5 };
    stepSim(jumper, [move(1, 0), jump]);
    run(jumper, 35, () => [move(1, 0)]);
    expect(jumper.players[0].pos.x).toBeGreaterThan(36);
    expect(jumper.players[0].hp).toBe(100);
  });

  it('jumps over a barrier (low wall); walking into it stops', () => {
    const walker = quietSim();
    walker.players[0].pos = { x: 16.5, z: 32.5 };
    run(walker, 40, () => [move(0, 1)]);
    expect(walker.players[0].pos.z).toBeLessThan(33);

    const jumper = quietSim();
    jumper.players[0].pos = { x: 16.5, z: 32.5 };
    stepSim(jumper, [move(0, 1), jump]);
    run(jumper, 40, () => [move(0, 1)]);
    expect(jumper.players[0].pos.z).toBeGreaterThan(35);
  });

  it('takes 10 damage per second standing on glitch floor', () => {
    const s = quietSim();
    s.players[0].pos = { x: 34.5, z: 34.5 };
    run(s, 60);
    expect(s.players[0].hp).toBeCloseTo(90, 1);
  });
});

describe('dash', () => {
  it('covers about 4 tiles, hurts what it passes and makes invulnerable', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos.z = 60.5;
    const x0 = p.pos.x;
    const tank = spawnEnemy(s, 'tank', rel(p.pos, 2, 0));
    stepSim(s, [move(1, 0), dash]);
    expect(s.events).toContainEqual({ type: 'dash', playerId: 0 });
    run(s, 8, () => [move(1, 0)]);
    expect(p.pos.x - x0).toBeGreaterThan(3.8);
    expect(p.pos.x - x0).toBeLessThan(4.3);
    expect(tank.hp).toBe(ENEMIES.tank.hp - DASH_DAMAGE);
    expect(p.hp).toBe(100);
  });

  it('needs 72 ticks to recharge', () => {
    const s = quietSim();
    stepSim(s, [dash]);
    const early = run(s, 60, () => [dash]);
    expect(early.some(e => e.type === 'dash')).toBe(false);
    const later = run(s, 20, () => [dash]);
    expect(later.filter(e => e.type === 'dash')).toHaveLength(1);
  });

  it('stops at a wall', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = { x: 42, z: 60.5 };
    stepSim(s, [move(1, 0), dash]);
    run(s, 10, () => [move(1, 0)]);
    expect(p.pos.x).toBeLessThanOrEqual(43.6 + 1e-6);
  });

  it('has a second charge with the dash perk', () => {
    const s = quietSim();
    s.players[0].perks.dash = 1;
    run(s, 80);
    stepSim(s, [dash]);
    const events = run(s, 20, () => [dash]);
    expect(events.filter(e => e.type === 'dash')).toHaveLength(1);
  });
});

describe('combo', () => {
  function killBlobs(s: ReturnType<typeof quietSim>, n: number) {
    for (let i = 0; i < n; i++) {
      const e = spawnEnemy(s, 'blob', rel(s.players[0].pos, 20, 0));
      damageEnemy(s, e, 100, 'pixelBlaster', 0);
    }
  }

  it('reaches x2 after 10 kills and doubles the score', () => {
    const s = quietSim();
    const p = s.players[0];
    killBlobs(s, 9);
    expect(comboMult(p)).toBe(1);
    expect(s.score).toBe(90);
    killBlobs(s, 1);
    expect(comboMult(p)).toBe(2);
    expect(s.events).toContainEqual({ type: 'comboUp', playerId: 0, mult: 2 });
    expect(s.score).toBe(110);
    expect(s.stats.maxCombo).toBe(10);
    expect(s.stats.kills.weapon).toBe(10);
  });

  it('makes coins worth more too, but only by a quarter of what it does to the score', () => {
    expect([1, 2, 3, 5, 7, 10].map(m => coinValue(m, 0))).toEqual([1, 1, 2, 2, 3, 3]);
    // every Coin Bonus perk adds a quarter on top
    expect(coinValue(1, 3)).toBe(2);
    expect(coinValue(10, 3)).toBe(6);
    const s = quietSim();
    s.players[0].combo = 100;
    killBlobs(s, 1);
    expect(s.coins[s.coins.length - 1].value).toBe(coinValue(10, 0));
  });

  it('is capped at x10', () => {
    const s = quietSim();
    s.players[0].combo = 500;
    expect(comboMult(s.players[0])).toBe(10);
  });

  it('expires 3 seconds after the last kill', () => {
    const s = quietSim();
    killBlobs(s, 10);
    s.coins = [];
    const before = run(s, 179);
    expect(s.players[0].combo).toBe(10);
    expect(before.some(e => e.type === 'comboLost')).toBe(false);
    const after = run(s, 3);
    expect(s.players[0].combo).toBe(0);
    expect(after).toContainEqual({ type: 'comboLost', playerId: 0 });
  });

  it('is kept alive by picking up coins', () => {
    const s = quietSim();
    killBlobs(s, 10);
    s.coins = [];
    run(s, 170);
    s.coins.push({ id: s.nextId++, pos: { ...s.players[0].pos }, value: 1, expiresAt: 1e9 });
    run(s, 60);
    expect(s.players[0].combo).toBe(10);
  });

  it('gives tower kills score but no combo', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'blob', rel(s.players[0].pos, 20, 0));
    damageEnemy(s, e, 100, 'laser');
    expect(s.players[0].combo).toBe(0);
    expect(s.score).toBe(10);
    expect(s.stats.kills.tower).toBe(1);
  });
});

describe('coins', () => {
  it('expire after 8 seconds', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'blob', rel(s.players[0].pos, 0, -6));
    damageEnemy(s, e, 100, 'laser');
    run(s, 479);
    expect(s.coins).toHaveLength(1);
    run(s, 2);
    expect(s.coins).toHaveLength(0);
  });

  it('are pulled in within the magnet radius and count a streak', () => {
    const s = quietSim();
    const p = s.players[0];
    s.coins.push({ id: s.nextId++, pos: rel(p.pos, 2.2, 0), value: 3, expiresAt: 1e9 });
    const events = run(s, 30);
    expect(p.coins).toBe(3);
    expect(events).toContainEqual({ type: 'coinPicked', playerId: 0, streak: 1 });
  });
});

describe('credits', () => {
  it('lose one per down, respawn at the safe point with 2 s invulnerability and 25 % fewer coins', () => {
    const s = quietSim();
    const p = s.players[0];
    p.coins = 40;
    p.safePoint = { x: 30.5, z: 62.5 };
    damagePlayer(s, p, 1000);
    expect(s.credits).toBe(2);
    expect(s.events).toContainEqual({ type: 'creditLost', credits: 2, playerId: 0 });
    expect(p.coins).toBe(30);
    expect(s.stats.downs).toBe(1);
    const events = run(s, 181);
    expect(events).toContainEqual({ type: 'playerRespawn', playerId: 0 });
    expect(p.pos).toEqual({ x: 30.5, z: 62.5 });
    expect(p.hp).toBe(100);
    damagePlayer(s, p, 50);
    expect(p.hp).toBe(100);
    run(s, 121);
    damagePlayer(s, p, 50);
    expect(p.hp).toBe(50);
  });

  it('end the run on the third down, exactly once', () => {
    const s = quietSim();
    const p = s.players[0];
    const all = [];
    for (let i = 0; i < 3; i++) {
      p.invulnUntil = 0;
      damagePlayer(s, p, 1000);
      all.push(...s.events);
      all.push(...run(s, 181));
    }
    expect(s.credits).toBe(0);
    expect(s.phase).toBe('lost');
    expect(all.filter(e => e.type === 'gameLost')).toHaveLength(1);
    const tick = s.tick;
    stepSim(s, []);
    expect(s.tick).toBe(tick);
  });

  it('cannot move while down', () => {
    const s = quietSim();
    const p = s.players[0];
    damagePlayer(s, p, 1000);
    const x = p.pos.x;
    run(s, 30, () => [move(1, 0)]);
    expect(p.pos.x).toBe(x);
  });
});

describe('hit feedback', () => {
  it('reports continuous damage at most four times a second', () => {
    const s = quietSim();
    s.players[0].pos = { x: 34.5, z: 34.5 };
    const events = run(s, 60);
    expect(s.players[0].hp).toBeLessThan(100);
    expect(events.filter(e => e.type === 'playerHit').length).toBeLessThanOrEqual(4);
    expect(events.filter(e => e.type === 'playerHit').length).toBeGreaterThanOrEqual(1);
  });
});

describe('tiles and perks', () => {
  it('boost tiles speed the player up for 2 seconds', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = { x: 22.5, z: 15.5 };
    const x0 = p.pos.x;
    const events = run(s, 60, () => [move(1, 0)]);
    expect(events.some(e => e.type === 'boost')).toBe(true);
    expect(p.pos.x - x0).toBeGreaterThan(9);
  });

  it('speed perk adds 12 %', () => {
    const s = quietSim();
    const p = s.players[0];
    p.perks.speed = 1;
    const x0 = p.pos.x;
    run(s, 60, () => [move(1, 0)]);
    expect(p.pos.x - x0).toBeCloseTo(6.72, 2);
  });

  it('regen perk heals 1 hp per second', () => {
    const s = quietSim();
    const p = s.players[0];
    p.hp = 50;
    p.perks.regen = 1;
    run(s, 60);
    expect(p.hp).toBeCloseTo(51, 1);
  });
});

describe('run stats', () => {
  it('track distance, idle time and a sample every 10 seconds', () => {
    const s = quietSim();
    run(s, 300, () => [move(0, 1)]);
    run(s, 300);
    expect(s.stats.distance).toBeGreaterThan(5);
    expect(s.stats.idleTicks).toBeGreaterThanOrEqual(300);
    expect(s.stats.samples).toHaveLength(1);
    expect(s.stats.samples[0]).toMatchObject({ t: 10, alarm: 0 });
    expect(s.stats.samples[0].distance).toBeCloseTo(s.stats.distance, 5);
  });
});
