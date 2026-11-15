import { describe, expect, it } from 'vitest';
import { applySnapshot, encodeSnapshot } from '../../src/net/snapshot';
import { TWIN_BOSS } from '../../src/sim/config/balance';
import { BOSS_RUSH, FLOORS } from '../../src/sim/config/floors';
import { BLOCKS_ENEMY, BLOCKS_WALKER, isFree, reachable, Tile, tileAt } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { BRAWL, spawnBoss } from '../../src/sim/systems/boss';
import { damageEnemy } from '../../src/sim/systems/combat';
import { HELI, heliHeight, heliRun } from '../../src/sim/systems/heli';
import { TICK_RATE, type Command, type SimEvent, type SimState } from '../../src/sim/types';
import { targets } from '../../src/sim/util';

/** a Single floor on the Sky Helipad: its own boss, nothing else about, the player safe unless a test says otherwise */
function fight(map = 'helipad', seed = 5, players = 1): SimState {
  const s = createSim(FLOORS[map].map, seed, { mode: 'quick', players });
  s.crates = [];
  if (s.boss?.kind !== 'heli') {
    s.enemies = [];
    s.hordes = [];
    s.nests = [];
    s.boss = null;
    s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    spawnBoss(s, 'heli');
  }
  for (const p of s.players) p.invulnUntil = 1e9;
  s.nextPowerupAt = Number.MAX_SAFE_INTEGER;
  return s;
}
const bodyOf = (s: SimState, b = s.boss!) => s.enemies.find(e => e.id === b.enemyId)!;
/** steps until `done` says so (or `max` ticks are over), and gives back every event on the way */
function until(s: SimState, done: () => boolean, max = 40 * TICK_RATE, commands: () => Command[] = () => []): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !done(); i++) {
    stepSim(s, commands());
    all.push(...s.events);
  }
  return all;
}
const low = (s: SimState) => s.boss?.heli?.mode === 'low';

describe('the attack helicopter of the Sky Helipad', () => {
  it('is the pad\'s own boss on a Single floor, in the Boss Rush and in the Boss Brawl, and flies in up high', () => {
    const s = fight();
    expect(s.boss?.kind).toBe('heli');
    expect(BOSS_RUSH.find(b => b.boss === 'heli')?.map).toBe('helipad');
    expect(BRAWL.kinds).toContain('heli');
    const body = bodyOf(s);
    expect(body.fly).toBe('high');
    expect(s.boss!.heli!.mode).toBe('circle');
    expect(heliHeight(s.boss!.heli!, s.tick)).toBe(HELI.cruise);
    // (from the edge of the map, on its way to the players)
    expect(body.pos.z).toBeLessThan(4);
    const start = { ...body.pos };
    until(s, () => false, 2 * TICK_RATE);
    expect(Math.hypot(body.pos.x - start.x, body.pos.z - start.z)).toBeGreaterThan(8);
  });

  it('is out of reach while it flies: nothing targets it, nothing hurts it, and shots pass under it', () => {
    const s = fight();
    const body = bodyOf(s), p = s.players[0];
    until(s, () => false, 3 * TICK_RATE);
    expect(body.fly).toBe('high');
    expect(targets(s)).not.toContain(body);
    damageEnemy(s, body, 500, 'bomb', 0);
    expect(body.hp).toBe(body.maxHp);
    // a player right under it fires along the floor past it: the shot flies on
    p.weapons = [{ kind: 'pixelBlaster', level: 5, cooldown: 0 }];
    p.selected = 0;
    let fired = 0, flown = 0;
    until(s, () => low(s) || s.boss!.heli!.mode === 'descend', 6 * TICK_RATE, () => {
      p.pos = { x: body.pos.x, z: body.pos.z + 3 };
      fired += s.events.filter(e => e.type === 'shot').length;
      flown = Math.max(flown, ...s.projectiles.filter(q => !q.hostile).map(q => p.pos.z - q.pos.z));
      return [{ type: 'aim', playerId: 0, point: { x: body.pos.x, z: body.pos.z - 6 } }, { type: 'fire', playerId: 0 }];
    });
    expect(fired).toBeGreaterThan(3);
    expect(flown).toBeGreaterThan(4.5);
    expect(body.hp).toBe(body.maxHp);
  });

  it('comes down again and again: a clear window in which it can be hurt, never long in coming', () => {
    const s = fight();
    const body = bodyOf(s);
    let windows = 0, away = 0, longestAway = 0, down = 0, was = false;
    for (let i = 0; i < 120 * TICK_RATE; i++) {
      stepSim(s, []);
      const within = body.fly === 'low';
      if (within && !was) windows++;
      was = within;
      away = within ? 0 : away + 1;
      down += within ? 1 : 0;
      longestAway = Math.max(longestAway, away);
      // (within reach is what the rules go by: it is targeted and takes damage exactly then)
      expect(targets(s).includes(body)).toBe(within);
    }
    expect(windows).toBeGreaterThanOrEqual(5);
    // never out of reach for longer than its time in the air and the way up and down
    expect(longestAway).toBeLessThanOrEqual((HELI.airSeconds[1] + 2) * TICK_RATE + HELI.descendTicks + HELI.riseTicks);
    // and within reach for well over a third of the fight
    expect(down / (120 * TICK_RATE)).toBeGreaterThan(0.4);
    const hp = body.hp;
    until(s, () => low(s));
    damageEnemy(s, body, 5, 'pixelBlaster', 0);
    expect(body.hp).toBeCloseTo(hp - 5, 5);
  });

  it('tells when it comes down and where, and comes down on open floor near a player', () => {
    const s = fight();
    const events = until(s, () => low(s));
    const call = events.find(e => e.type === 'heliDown');
    expect(call).toBeDefined();
    const h = s.boss!.heli!, body = bodyOf(s), p = s.players[0];
    expect(call).toMatchObject({ pos: h.spot });
    expect(body.pos).toEqual(h.spot);
    expect(isFree(s.map, h.spot, HELI.radius, BLOCKS_ENEMY)).toBe(true);
    expect(Math.hypot(h.spot.x - p.pos.x, h.spot.z - p.pos.z)).toBeLessThan(HELI.landOff + 2.5);
    expect(until(s, () => !low(s)).some(e => e.type === 'heliUp')).toBe(true);
  });

  it('every missile and every strike of its gun is marked on the floor before it lands', () => {
    const s = fight();
    const seen = new Set<number>();
    let salvos = 0, guns = 0;
    for (let i = 0; i < 60 * TICK_RATE; i++) {
      stepSim(s, []);
      salvos += s.events.filter(e => e.type === 'heliMissiles').length;
      guns += s.events.filter(e => e.type === 'heliGun').length;
      const warned = s.events.filter(e => e.type === 'blastWarning').length;
      const fresh = s.blasts.filter(b => !seen.has(b.id));
      expect(warned).toBe(fresh.length);
      for (const b of fresh) {
        seen.add(b.id);
        expect(b.hidden).toBeFalsy();
        expect(b.at - b.createdAt).toBeGreaterThanOrEqual(HELI.gunWarn);
      }
    }
    expect(salvos).toBeGreaterThanOrEqual(3);
    expect(guns).toBeGreaterThanOrEqual(3);
  });

  it('a missile hurts whoever stays in its ring, and nobody who steps out of it', () => {
    const hurt = (dodge: boolean) => {
      const s = fight();
      const p = s.players[0];
      const at = { ...p.pos };
      until(s, () => s.blasts.some(b => Math.hypot(b.pos.x - at.x, b.pos.z - at.z) < 0.1), 20 * TICK_RATE, () => {
        p.pos = { ...at };
        return [];
      });
      const mine = s.blasts.find(b => Math.hypot(b.pos.x - at.x, b.pos.z - at.z) < 0.1)!;
      expect(mine).toBeDefined();
      // (from here on they can be hurt)
      p.invulnUntil = 0;
      const hp = p.hp;
      // (the player walks off to the side the moment the ring appears, at their own pace; other rings may lie there)
      const clear = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }].find(d => s.blasts.every(b => Math.hypot(b.pos.x - (at.x + d.x * 3.3), b.pos.z - (at.z + d.z * 3.3)) > b.radius + 0.6))!;
      until(s, () => s.tick > mine.at, 200, () => (dodge ? (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 3.3 ? [{ type: 'move', playerId: 0, dir: clear }] : []) : []));
      return hp - p.hp;
    };
    expect(hurt(false)).toBeGreaterThan(0);
    expect(hurt(true)).toBe(0);
  });

  it('its wash does not blow whoever is up in the air on a jetpack', () => {
    const s = fight();
    until(s, () => low(s));
    const body = bodyOf(s), p = s.players[0];
    Object.assign(p, { jetpack: true, jetFuel: 300, flying: true });
    p.pos = { x: body.pos.x + 2.2, z: body.pos.z };
    const at = { ...p.pos };
    until(s, () => false, 20, () => [{ type: 'fly', playerId: 0 }]);
    expect(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)).toBeLessThan(0.05);
  });

  it('a Lock-On missile after it lets go once it climbs out of reach, and is not spent on it', () => {
    const s = fight();
    until(s, () => low(s));
    const body = bodyOf(s);
    s.projectiles.push({ id: s.nextId++, kind: 'missileLauncher', behavior: 'missile', pos: { x: body.pos.x + 6, z: body.pos.z }, vel: { x: -13, z: 0 }, damage: 150, pierce: 0, until: s.tick + 360, hitIds: [], ownerId: 0, launchedAt: s.tick, seek: { id: body.id, rival: false } });
    body.fly = 'high';
    s.boss!.heli!.mode = 'circle';
    const hp = body.hp;
    const missile = s.projectiles[s.projectiles.length - 1];
    // (it flies on straight, past where the helicopter is, instead of turning round to it)
    for (let i = 0; i < 20; i++) stepSim(s, []);
    expect(body.hp).toBe(hp);
    expect(missile.vel.z).toBe(0);
  });

  it('its wash blows a player on foot away from under it, harder the nearer its middle, and never into a wall', () => {
    const s = fight();
    until(s, () => low(s));
    const body = bodyOf(s), p = s.players[0];
    p.pos = { x: body.pos.x + 2.2, z: body.pos.z };
    const before = Math.hypot(p.pos.x - body.pos.x, p.pos.z - body.pos.z);
    until(s, () => false, 30);
    const after = Math.hypot(p.pos.x - body.pos.x, p.pos.z - body.pos.z);
    expect(after).toBeGreaterThan(before + 0.5);
    expect(tileAt(s.map, p.pos.x, p.pos.z)).not.toBe(Tile.Wall);
    // (walking against it still gets you there)
    until(s, () => false, 60, () => [{ type: 'move', playerId: 0, dir: { x: body.pos.x - p.pos.x, z: body.pos.z - p.pos.z } }]);
    expect(Math.hypot(p.pos.x - body.pos.x, p.pos.z - body.pos.z)).toBeLessThan(after - 0.5);
    // and out of its reach nothing moves
    p.pos = { x: body.pos.x + HELI.washRadius + 1, z: body.pos.z };
    const far = { ...p.pos };
    until(s, () => false, 10);
    expect(p.pos).toEqual(far);
  });

  it('a swoop hangs over a player out of reach and blows them about; a strafe marks a line through them', () => {
    const s = fight();
    const body = bodyOf(s), p = s.players[0];
    s.boss!.nextAttackAt = 1e9;
    s.boss!.heli!.until = 1e9;
    // (it has flown in and circles over them)
    until(s, () => false, 5 * TICK_RATE);
    heliRun(s, p, 'swoop');
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'heliSwoop' }));
    const at = { ...p.pos };
    until(s, () => false, 90);
    expect(body.fly).toBe('high');
    expect(heliHeight(s.boss!.heli!, s.tick)).toBeCloseTo(HELI.swoop, 5);
    expect(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)).toBeGreaterThan(1);
    until(s, () => s.boss!.heli!.run === null, 200);
    expect(heliHeight(s.boss!.heli!, s.tick)).toBe(HELI.cruise);
    s.boss!.heli!.until = s.tick + 600;
    s.blasts = [];
    heliRun(s, p, 'strafe');
    expect(s.blasts.length).toBeGreaterThanOrEqual(HELI.strafeLine - 4);
    expect(s.blasts.some(b => Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < b.radius)).toBe(true);
    for (const b of s.blasts) expect(b.at - s.tick).toBeGreaterThanOrEqual(HELI.strafeWarn);
  });

  it('gets meaner as its health drops: it breaks off and climbs away, calls for help, and fires bigger salvos', () => {
    const s = fight();
    const body = bodyOf(s);
    until(s, () => low(s));
    until(s, () => false, 60);
    body.hp = body.maxHp * 0.6;
    stepSim(s, []);
    expect(s.boss!.phase).toBe(2);
    expect(s.events).toContainEqual({ type: 'bossPhase', phase: 2 });
    // (help comes: a horde that goes for the players)
    expect(s.enemies.length).toBeGreaterThan(1);
    until(s, () => body.fly === 'high', HELI.breakOffTicks + HELI.riseTicks + 5);
    expect(body.fly).toBe('high');
    const biggest = (phase: 1 | 2 | 3) => {
      const f = fight();
      bodyOf(f).hp = bodyOf(f).maxHp * (phase === 1 ? 1 : phase === 2 ? 0.6 : 0.3);
      const ev = until(f, () => false, 40 * TICK_RATE);
      return Math.max(0, ...ev.map(e => (e.type === 'heliMissiles' ? e.to.length : 0)));
    };
    expect(biggest(1)).toBeLessThanOrEqual(HELI.salvo[1]);
    expect(biggest(3)).toBeGreaterThan(biggest(1));
    expect(HELI.lowSeconds[3]).toBeLessThan(HELI.lowSeconds[1]);
  });

  it('shot down, it comes down burning with a blast that is marked first, and leaves coins, a crate and the open elevator', () => {
    const s = fight();
    until(s, () => low(s));
    const body = bodyOf(s), at = { ...body.pos };
    s.blasts = [];
    body.hp = 0;
    stepSim(s, []);
    expect(s.boss).toBeNull();
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'bossDead', kind: 'heli' }));
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'heliCrash', at: s.tick - 1 + HELI.crashTicks }));
    expect(s.elevatorOpen).toBe(true);
    expect(s.coins.length).toBeGreaterThanOrEqual(60);
    expect(s.crates).toHaveLength(1);
    expect(isFree(s.map, s.crates[0].pos, 0.4, BLOCKS_WALKER)).toBe(true);
    const wreck = s.blasts.find(b => Math.hypot(b.pos.x - at.x, b.pos.z - at.z) < 0.1)!;
    expect(wreck.radius).toBe(HELI.wreckRadius);
    expect(wreck.at - wreck.createdAt).toBe(HELI.crashTicks);
    // (the crate lies clear of where the wreck comes down)
    expect(Math.hypot(s.crates[0].pos.x - at.x, s.crates[0].pos.z - at.z)).toBeGreaterThan(HELI.wreckRadius);
  });

  it('the crate it leaves often holds a Lock-On Launcher', () => {
    let launchers = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = fight('helipad', seed);
      bodyOf(s).hp = 0;
      stepSim(s, []);
      if (s.crates[0]?.prize === 'missileLauncher') launchers++;
    }
    expect(launchers).toBeGreaterThan(6);
    expect(launchers).toBeLessThan(18);
  });

  it('comes twice for a big team: the two keep apart, take turns coming down, and both have to fall', () => {
    const s = fight('helipad', 5, TWIN_BOSS.players);
    expect(s.bosses).toHaveLength(2);
    const [a, b] = s.bosses!;
    let bothLow = 0, anyLow = 0, closest = Infinity;
    for (let i = 0; i < 90 * TICK_RATE; i++) {
      stepSim(s, []);
      const la = a.heli!.mode === 'low', lb = b.heli!.mode === 'low';
      if (la && lb) bothLow++;
      if (la || lb) anyLow++;
      if (a.heli!.mode !== 'circle' && b.heli!.mode !== 'circle') closest = Math.min(closest, Math.hypot(a.heli!.spot.x - b.heli!.spot.x, a.heli!.spot.z - b.heli!.spot.z));
    }
    expect(anyLow / (90 * TICK_RATE)).toBeGreaterThan(0.5);
    expect(bothLow).toBeLessThan(anyLow * 0.5);
    expect(closest).toBeGreaterThanOrEqual(HELI.landApart);
    bodyOf(s, a).hp = 0;
    stepSim(s, []);
    expect(s.elevatorOpen).toBe(false);
    expect(s.boss).toBe(b);
    bodyOf(s, b).hp = 0;
    stepSim(s, []);
    expect(s.elevatorOpen).toBe(true);
  });

  it('travels to the clients: that it flies, and what it is doing', () => {
    const host = fight();
    until(host, () => low(host));
    const view = createSim(FLOORS.helipad.map, 5, { mode: 'quick' });
    expect(applySnapshot(view, JSON.parse(JSON.stringify(encodeSnapshot(host))))).toBe(true);
    const there = bodyOf(host), here = view.enemies.find(e => e.id === there.id)!;
    expect(here.fly).toBe('low');
    expect(view.boss!.heli!.mode).toBe('low');
    expect(view.boss!.heli!.spot.x).toBeCloseTo(host.boss!.heli!.spot.x, 1);
    expect(view.enemies.filter(e => e.fly)).toHaveLength(1);
    until(host, () => there.fly === 'high');
    applySnapshot(view, JSON.parse(JSON.stringify(encodeSnapshot(host))));
    expect(view.enemies.find(e => e.id === there.id)!.fly).toBe('high');
  });
});

describe('the attack helicopter away from its pad', () => {
  const MAPS = ['arena', 'floor01', 'candy', 'neon', 'highway', 'rooftop', 'uplink', 'jungle', 'servers', 'underwater', 'waldsee'].filter(id => FLOORS[id]);
  for (const map of MAPS)
    it(`on ${map}: it comes down on floor the players can walk to, in reach of a player who stands still, time and again`, () => {
      const s = fight(map, 3);
      const p = s.players[0], body = bodyOf(s);
      const walk = reachable(s.map, s.map.spawn, BLOCKS_WALKER);
      let landings = 0;
      for (let i = 0; i < 60 * TICK_RATE; i++) {
        const was = low(s);
        stepSim(s, []);
        if (!low(s) || was) continue;
        landings++;
        expect(tileAt(s.map, body.pos.x, body.pos.z)).not.toBe(Tile.Wall);
        expect(walk[Math.floor(body.pos.z) * s.map.w + Math.floor(body.pos.x)]).toBe(1);
        expect(Math.hypot(body.pos.x - p.pos.x, body.pos.z - p.pos.z)).toBeLessThan(HELI.landOff + 2.5);
      }
      expect(landings).toBeGreaterThanOrEqual(2);
      // (and all the while it stays over the map)
      expect(body.pos.x).toBeGreaterThan(1);
      expect(body.pos.x).toBeLessThan(s.map.w - 1);
    }, 30_000);
});
