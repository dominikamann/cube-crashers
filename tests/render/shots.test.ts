import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOLT_MODEL, BONBON, createShots, HOTDOG_MODEL, MAX_PIXELS, shotEnd, slashSweep, voxelGeometry, type ShotFx } from '../../src/render/shots';
import { THEMES } from '../../src/render/theme';
import { weaponModel } from '../../src/render/viewmodel';
import { ALL_RARE } from '../../src/sim/config/rare';
import { ALL_WEAPONS, HOTDOG } from '../../src/sim/config/weapons';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { TICK_RATE, type SimEvent, type SimState, type WeaponKind } from '../../src/sim/types';

const DT = 1 / TICK_RATE;

/** what is drawn right now: the instances of every pool in the scene */
const drawn = (scene: THREE.Scene) => scene.children.reduce((n, o) => n + (o.visible ? (o as THREE.InstancedMesh).count : 0), 0);

/** a player with one weapon and nothing else on the floor; `fire` steps the game with the trigger held and shows every tick */
function range(kind: WeaponKind) {
  const scene = new THREE.Scene();
  const calls = { burst: 0, chunks: 0, flash: 0, stain: 0, shake: 0 };
  const fx: ShotFx = { burst: () => calls.burst++, chunks: () => calls.chunks++, flash: () => calls.flash++, stain: () => calls.stain++, shake: () => calls.shake++ };
  const shots = createShots(scene, fx);
  const s = createSim(floor01, 1);
  s.enemies = [];
  s.hordes = [];
  s.nests = [];
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  const p = s.players[0];
  p.weapons = [{ kind, level: 1, cooldown: 0 }];
  p.selected = 0;
  let time = 0;
  const step = (ticks: number, fire: boolean, aim = { x: 1, z: 0 }) => {
    const seen: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      stepSim(s, [{ type: 'aim', playerId: p.id, point: { x: p.pos.x + aim.x * 5, z: p.pos.z + aim.z * 5 } }, ...(fire ? [{ type: 'fire' as const, playerId: p.id }] : [])]);
      shots.update(s, s.events, THEMES.day, DT, (time += DT));
      seen.push(...s.events);
    }
    return seen;
  };
  return { scene, shots, s, p, calls, step };
}

/** the way from the player along +x is free of walls for this far */
const clearAhead = (s: SimState, far: number) => {
  for (let x = 0; x < far; x++) for (const dz of [-1, 0, 1]) s.map.tiles[(Math.floor(s.players[0].pos.z) + dz) * s.map.w + Math.floor(s.players[0].pos.x) + x] = 0;
};

describe('how a shot ended', () => {
  const bolt = { x: 5.5, z: 5.5, vx: 20, vz: 0, until: 100, tick: 10 };

  it('against a wall: it stops in front of it', () => {
    const e = shotEnd(bolt, 11, x => x >= 5.6);
    expect(e.how).toBe('wall');
    expect(e.x).toBe(5.5);
  });

  it('at the end of its reach', () => {
    expect(shotEnd({ ...bolt, until: 10 }, 11, () => false).how).toBe('spent');
  });

  it('in something it hit: neither a wall nor its time', () => {
    const e = shotEnd(bolt, 11, () => false);
    expect(e.how).toBe('hit');
    expect(e.x).toBeCloseTo(5.5 + 20 / TICK_RATE);
  });

  it('a frame that skipped ticks follows the shot through all of them', () => {
    expect(shotEnd(bolt, 13, x => x >= 6.3).how).toBe('wall');
    expect(shotEnd(bolt, 13, () => false).x).toBeCloseTo(5.5 + (3 * 20) / TICK_RATE);
  });

  it('agrees with the game: a bolt into the open is spent, one at a monster hits, one at a wall stops there', () => {
    // (the flash where it ends is asked for only for a hit and a wall)
    const open = range('pixelBlaster');
    clearAhead(open.s, 14);
    open.step(1, true);
    open.step(50, false);
    expect(open.s.projectiles.length).toBe(0);
    expect(open.calls.flash).toBe(1);

    const hit = range('pixelBlaster');
    clearAhead(hit.s, 14);
    spawnEnemy(hit.s, 'tank', { x: hit.p.pos.x + 4, z: hit.p.pos.z }).speed = 0;
    hit.step(1, true);
    const events = hit.step(50, false);
    expect(events.some(e => e.type === 'enemyHit')).toBe(true);
    expect(hit.calls.flash).toBe(2);

    const wall = range('pixelBlaster');
    clearAhead(wall.s, 4);
    wall.s.map.tiles[Math.floor(wall.p.pos.z) * wall.s.map.w + Math.floor(wall.p.pos.x) + 4] = 1;
    wall.step(1, true);
    wall.step(50, false);
    expect(wall.calls.flash).toBe(2);
    expect(wall.calls.burst).toBeGreaterThan(0);
  });
});

describe('the sword\'s slash', () => {
  it('sweeps from one side of the arc to the other, fast at first', () => {
    expect(slashSweep(0)).toBe(1);
    expect(slashSweep(1)).toBe(-1);
    expect(slashSweep(2)).toBe(-1);
    expect(slashSweep(0.25)).toBeLessThan(0);
  });
});

describe('the models of the shots', () => {
  it('are boxes merged into one geometry, each in its colour', () => {
    for (const parts of [BOLT_MODEL, BONBON, HOTDOG_MODEL]) {
      const g = voxelGeometry(parts);
      expect(g.getAttribute('position').count).toBe(parts.length * 24);
      expect(g.getAttribute('color').count).toBe(parts.length * 24);
      expect(g.getIndex()!.count).toBe(parts.length * 36);
    }
  });

  it('every weapon, and every rare one, has a model of its own to hold', () => {
    const size = (kind: Parameters<typeof weaponModel>[0]) => weaponModel(kind).children.length;
    for (const kind of [...ALL_WEAPONS, ...ALL_RARE, 'thunderHammer' as const]) expect(size(kind), kind).toBeGreaterThan(3);
  });
});

describe('the weapons\' shots', () => {
  it('every weapon shows something when it fires', () => {
    for (const kind of ALL_WEAPONS) {
      if (kind === 'discoBall') continue;
      const { scene, step, s, p } = range(kind);
      clearAhead(s, 8);
      spawnEnemy(s, 'tank', { x: p.pos.x + 1.5, z: p.pos.z }).speed = 0;
      step(3, true);
      expect(drawn(scene), kind).toBeGreaterThan(0);
    }
  });

  it('draws from pools that are made once, however much is fired', () => {
    const { scene, step, s, p } = range('candyCannon');
    clearAhead(s, 8);
    const pools = scene.children.length;
    const geometries = new Set(scene.children.map(o => (o as THREE.InstancedMesh).geometry.uuid));
    for (const kind of ALL_WEAPONS) {
      if (kind === 'discoBall') continue;
      p.weapons = [{ kind, level: 5, cooldown: 0 }];
      step(120, true);
    }
    expect(scene.children.length).toBe(pools);
    for (const o of scene.children) expect(geometries.has((o as THREE.InstancedMesh).geometry.uuid)).toBe(true);
  });

  it('never has more bits in the air than its limit', () => {
    const { shots, s, p } = range('pixelRail');
    const rail: SimEvent = { type: 'railFired', from: { ...p.pos }, to: { x: p.pos.x + 14, z: p.pos.z } };
    for (let i = 0; i < 40; i++) {
      shots.explode(p.pos, 3);
      shots.update(s, Array.from({ length: 20 }, () => rail), THEMES.day, DT, i * DT);
    }
    expect(shots.pixels()).toBeGreaterThan(MAX_PIXELS / 2);
    expect(shots.pixels()).toBeLessThanOrEqual(MAX_PIXELS);
  });

  it('low graphics: fewer bits', () => {
    const bits = (low: boolean) => {
      const { shots, s, p } = range('pixelRail');
      shots.setLow(low);
      shots.explode(p.pos, 3);
      shots.update(s, [{ type: 'railFired', from: { ...p.pos }, to: { x: p.pos.x + 14, z: p.pos.z } }], THEMES.day, DT, 0);
      return shots.pixels();
    };
    expect(bits(true)).toBeLessThan(bits(false) * 0.7);
  });

  it('a hot dog bursts into ketchup where it lands, not into fire; a bomb and anything else burn', () => {
    const dog = range('hotdogSlinger');
    clearAhead(dog.s, 8);
    dog.step(1, true);
    const events = dog.step(HOTDOG.flightTicks - 2, false);
    expect(events.some(e => e.type === 'explosion')).toBe(false);
    const target = dog.s.projectiles[0].target!;
    expect(dog.shots.explode(target, HOTDOG.radius)).toBe(true);
    expect(dog.calls.stain).toBe(1);
    expect(dog.shots.explode({ x: target.x + 5, z: target.z }, 2)).toBe(false);

    const bomb = range('bomb');
    clearAhead(bomb.s, 8);
    bomb.step(10, true);
    expect(bomb.shots.explode(bomb.s.projectiles[0].target!, 3)).toBe(false);
    expect(bomb.shots.pixels()).toBeGreaterThan(0);
  });

  it('a cut to another time (the kill cam) takes nothing of the time before with it', () => {
    const { shots, s, step, scene } = range('pixelBlaster');
    clearAhead(s, 14);
    step(20, true);
    shots.explode(s.players[0].pos, 3);
    expect(shots.pixels()).toBeGreaterThan(0);
    s.tick += 600;
    s.projectiles = [];
    shots.update(s, [], THEMES.day, DT, 1);
    expect(shots.pixels()).toBe(0);
    expect(drawn(scene)).toBe(0);
  });

  it('the muzzle flash is left out for whoever is looked through in first person', () => {
    const top = range('pixelBlaster');
    clearAhead(top.s, 14);
    top.step(1, true);
    expect(top.calls.flash).toBe(1);
    const fp = range('pixelBlaster');
    clearAhead(fp.s, 14);
    fp.shots.setEyes([fp.p.id]);
    fp.step(1, true);
    expect(fp.calls.flash).toBe(0);
  });
});
