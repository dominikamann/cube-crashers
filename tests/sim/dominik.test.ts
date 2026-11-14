import { describe, expect, it } from 'vitest';
import { RARE } from '../../src/sim/config/rare';
import { BOSS_RUSH, FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { DIFFICULTY } from '../../src/sim/config/difficulty';
import { BOSS, dominikHits, laserAngle, laserHits, spawnBoss } from '../../src/sim/systems/boss';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { MINI, releaseMiniDominik } from '../../src/sim/systems/mini-dominik';
import { fireRare } from '../../src/sim/systems/rare';
import { Tile } from '../../src/sim/map/tilemap';
import type { Difficulty, SimState } from '../../src/sim/types';

function fight(seed = 4): SimState {
  const s = createSim(FLOORS.arena.map, seed, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.crates = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, 'dominik');
  return s;
}
const bodyOf = (s: SimState) => s.enemies.find(e => e.id === s.boss!.enemyId)!;

describe('Angry Dominik', () => {
  it('is the very last boss of the Boss Rush', () => {
    expect(BOSS_RUSH[BOSS_RUSH.length - 1].boss).toBe('dominik');
  });

  it('is tougher than any other boss', () => {
    const s = fight();
    expect(bodyOf(s).maxHp).toBeGreaterThan(BOSS.rexHp);
  });

  it('his laser eyes sweep a beam: it hits who stands in it, not who stands beside it or beyond its reach', () => {
    const s = fight();
    const body = bodyOf(s);
    s.boss!.laser = { startAt: s.tick, fireAt: s.tick, endAt: s.tick + 100, from: 0, sweep: 1 };
    expect(laserAngle(s.boss!, s.tick)).toBe(0);
    expect(laserAngle(s.boss!, s.tick + 50)).toBeCloseTo(0.5);
    const at = (dx: number, dz: number) => ({ x: body.pos.x + dx, z: body.pos.z + dz });
    expect(laserHits(s, s.boss!, at(4, 0))).toBe(true);
    expect(laserHits(s, s.boss!, at(4, 2.5))).toBe(false);
    expect(laserHits(s, s.boss!, at(BOSS.laser.length + 3, 0))).toBe(false);
    expect(laserHits(s, s.boss!, at(-4, 0))).toBe(false);
  });

  it('the beam warns first, then burns a player who stays in it', () => {
    const s = fight();
    const body = bodyOf(s);
    body.speed = 0;
    const p = s.players[0];
    p.pos = { x: body.pos.x + 4, z: body.pos.z };
    s.boss!.nextAttackAt = 1e9;
    s.boss!.laser = { startAt: s.tick, fireAt: s.tick + 30, endAt: s.tick + 60, from: 0, sweep: 0 };
    const hp = p.hp;
    for (let i = 0; i < 25; i++) stepSim(s, []);
    expect(p.hp).toBe(hp);
    for (let i = 0; i < 30; i++) stepSim(s, []);
    expect(p.hp).toBeLessThan(hp);
    for (let i = 0; i < 20; i++) stepSim(s, []);
    expect(s.boss!.laser ?? null).toBeNull();
  });

  it('his eyes are heard once as they take aim and once as they start to burn', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    s.boss!.laser = null;
    const next = s.rng.next.bind(s.rng);
    s.rng.next = () => (s.tick >= s.boss!.nextAttackAt ? 0.1 : next());
    s.boss!.nextAttackAt = s.tick;
    let aims = 0, fires = 0;
    for (let i = 0; i < BOSS.laser.aimTicks + BOSS.laser.burnTicks + 10; i++) {
      if (i > 0) s.boss!.nextAttackAt = s.tick + 1000;
      stepSim(s, []);
      aims += s.events.filter(e => e.type === 'laserAim').length;
      fires += s.events.filter(e => e.type === 'laserFire').length;
    }
    expect(aims).toBe(1);
    expect(fires).toBe(1);
    expect(s.boss!.laser ?? null).toBeNull();
  });

  it('uses his eyes and his hammer', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    let lasers = 0, volleys = 0;
    let had = false;
    for (let i = 0; i < 90 * 60; i++) {
      stepSim(s, []);
      if (s.boss?.laser && !had) lasers++;
      had = !!s.boss?.laser;
      if (s.events.filter(e => e.type === 'blastWarning').length >= 6) volleys++;
    }
    expect(lasers).toBeGreaterThan(1);
    expect(volleys).toBeGreaterThan(1);
  });

  it('falls with thunder and usually leaves a crate with his hammer in it', () => {
    let hammers = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = fight(seed);
      bodyOf(s).hp = 0;
      stepSim(s, []);
      expect(s.events.some(e => e.type === 'bossDead' && e.kind === 'dominik')).toBe(true);
      expect(s.crates).toHaveLength(1);
      if (s.crates[0].prize === 'thunderHammer') hammers++;
    }
    expect(hammers).toBeGreaterThanOrEqual(12);
    expect(hammers).toBeLessThan(20);
  });

  it('the crate opens with the Thunder Hammer on top: a weapon for a minute', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.crates = [{ id: s.nextId++, pos: { x: s.players[0].pos.x + 0.3, z: s.players[0].pos.z }, prize: 'thunderHammer' }];
    for (let i = 0; i < 30 && s.offers.length === 0; i++) stepSim(s, []);
    expect(s.offers[0].cards[0]).toEqual({ type: 'rare', rare: 'thunderHammer' });
  });

  it('the Thunder Hammer smashes what is in front of you and its lightning jumps on', () => {
    const s = createSim(FLOORS.arena.map, 2, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    const p = s.players[0];
    p.aim = { x: 1, z: 0 };
    p.rare = { kind: 'thunderHammer', until: s.tick + RARE.durationTicks, cooldown: 0 };
    const near = spawnEnemy(s, 'tank', { x: p.pos.x + RARE.hammer.reach, z: p.pos.z });
    const chained = spawnEnemy(s, 'tank', { x: p.pos.x + RARE.hammer.reach + 4, z: p.pos.z });
    const far = spawnEnemy(s, 'tank', { x: p.pos.x - 12, z: p.pos.z });
    expect(fireRare(s, p)).toBe(true);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(chained.hp).toBeLessThan(chained.maxHp);
    expect(near.maxHp - near.hp).toBeGreaterThan(chained.maxHp - chained.hp);
    expect(far.hp).toBe(far.maxHp);
    expect(fireRare(s, p)).toBe(false);
  });
});

describe('he can be beaten on every level', () => {
  it('his blows grow with the difficulty, but far less than the other monsters\' do', () => {
    const hit = (d: Difficulty) => dominikHits(d) * DIFFICULTY[d].enemyDamage;
    expect(hit('low')).toBeGreaterThan(hit('ultraLow'));
    expect(hit('medium')).toBeGreaterThan(hit('low'));
    expect(hit('ultraHigh')).toBeGreaterThan(hit('medium'));
    // on Medium a blow is at most half again as hard as on Ultra Low (the plain scale would be nearly three times)
    expect(hit('medium')).toBeLessThanOrEqual(hit('ultraLow') * 1.5);
    expect(hit('ultraHigh')).toBeLessThanOrEqual(hit('ultraLow') * 2);
    expect(dominikHits('ultraLow')).toBe(1);
  });
});

describe('his lightning', () => {
  it('comes down as a bolt where each of those strikes lands', () => {
    const s = fight();
    s.players[0].invulnUntil = 1e9;
    let bolts = 0, marked = 0;
    for (let i = 0; i < 30 * 60; i++) {
      stepSim(s, []);
      bolts += s.events.filter(e => e.type === 'lightning').length;
      marked = Math.max(marked, s.blasts.filter(b => b.bolt).length);
    }
    expect(marked).toBeGreaterThan(0);
    expect(bolts).toBeGreaterThan(0);
  });
});

describe('a small Angry Dominik from the wall', () => {
  it('comes out, is nearly impossible to beat, and is gone again after half a minute', () => {
    const s = createSim(floor01, 1, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.nests = [];
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    s.players[0].invulnUntil = 1e9;
    releaseMiniDominik(s, { ...s.players[0].pos });
    expect(s.mini).toBeTruthy();
    const body = s.enemies.find(e => e.id === s.mini!.enemyId)!;
    expect(body.maxHp).toBeGreaterThan(3000);
    let joined = false;
    for (let i = 0; i < MINI.ticks - 30; i++) {
      stepSim(s, []);
      joined ||= s.events.some(e => e.type === 'dominikJoined');
    }
    expect(s.enemies.includes(body)).toBe(true);
    let left = false;
    for (let i = 0; i < 90; i++) {
      stepSim(s, []);
      left ||= s.events.some(e => e.type === 'dominikLeft');
    }
    expect(left).toBe(true);
    expect(s.mini ?? null).toBeNull();
    expect(s.enemies.includes(body)).toBe(false);
    void joined;
  });
});

describe("Angry Dominik's hammer", () => {
  /** a fight in which his next attack is the one `roll` picks (0.5: the throw, 0.9: the slam), with the player `away` tiles in front of him */
  function strike(roll: number, away: number): { s: SimState; from: { x: number; z: number } } {
    const s = fight();
    const dom = bodyOf(s);
    dom.speed = 0;
    const p = s.players[0];
    p.pos = { x: dom.pos.x, z: dom.pos.z + away };
    p.hp = p.maxHp = 1e6;
    // (the dice are fixed for the tick in which he attacks: the first roll there picks the attack)
    const next = s.rng.next.bind(s.rng);
    s.rng.next = () => (s.tick >= s.boss!.nextAttackAt ? roll : next());
    s.boss!.nextAttackAt = s.tick;
    return { s, from: { ...dom.pos } };
  }
  const still = (s: SimState, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      s.boss!.nextAttackAt = s.tick + 1000;
      stepSim(s, []);
    }
  };

  it('throws a player it hits several tiles away from him, and hurts', () => {
    const { s, from } = strike(0.9, BOSS.hammerRings[0]);
    const p = s.players[0];
    const before = { ...p.pos };
    stepSim(s, []);
    expect(s.blasts.some(b => b.fling)).toBe(true);
    still(s, BOSS.warnTicks + 5);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(Math.hypot(p.pos.x - from.x, p.pos.z - from.z) - Math.hypot(before.x - from.x, before.z - from.z)).toBeGreaterThan(3);
  });

  it('a wall stops the flight', () => {
    const { s, from } = strike(0.9, BOSS.hammerRings[0]);
    const p = s.players[0];
    stepSim(s, []);
    // a wall across his path, two tiles behind him (the map is shared by every test: put back as it was after)
    const row = Math.floor(p.pos.z) + 2;
    const before = s.map.tiles.slice(row * s.map.w, (row + 1) * s.map.w);
    for (let x = 0; x < s.map.w; x++) s.map.tiles[row * s.map.w + x] = Tile.Wall;
    try {
      still(s, BOSS.warnTicks + 5);
      expect(p.hp).toBeLessThan(p.maxHp);
      expect(p.pos.z).toBeLessThan(row);
      expect(p.pos.z).toBeGreaterThan(from.z + BOSS.hammerRings[0]);
    } finally {
      s.map.tiles.splice(row * s.map.w, s.map.w, ...before);
    }
  });

  it('his lightning hurts but throws no one', () => {
    // (far outside the rings: only the bolt that falls where the player stands reaches)
    const { s } = strike(0.9, 13);
    const p = s.players[0];
    const before = { ...p.pos };
    stepSim(s, []);
    still(s, BOSS.warnTicks + 20);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(p.pos).toEqual(before);
  });

  it('gives no warning on the floor for the throw (the hammer in the air is the warning), but one for the rings', () => {
    const thrown = strike(0.5, 4).s;
    stepSim(thrown, []);
    const line = thrown.blasts.filter(b => b.fling);
    expect(line).toHaveLength(BOSS.hammerLine * 2);
    expect(line.every(b => b.hidden)).toBe(true);
    // (the lightning that comes with it still warns)
    expect(thrown.events.filter(e => e.type === 'blastWarning')).toHaveLength(thrown.blasts.length - line.length);
    const slammed = strike(0.9, 4).s;
    stepSim(slammed, []);
    expect(slammed.blasts.filter(b => b.fling).length).toBeGreaterThan(10);
    expect(slammed.blasts.some(b => b.hidden)).toBe(false);
    expect(slammed.events.filter(e => e.type === 'blastWarning')).toHaveLength(slammed.blasts.length);
  });
});
