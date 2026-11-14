import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_DISCO_BEAMS, ZAP, zapSpan } from '../../src/render/disco';
import { createFx } from '../../src/render/fx';
import { THEMES } from '../../src/render/theme';
import { DISCO } from '../../src/sim/config/weapons';
import { createSim } from '../../src/sim/sim';
import { floor01 } from '../../src/sim/config/floor01';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import type { SimEvent } from '../../src/sim/types';

const DT = 1 / 60;

/** what is drawn right now: the instances of every pool in the scene */
const drawn = (scene: THREE.Scene) => scene.children.reduce((n, o) => n + (o.visible ? (o as THREE.InstancedMesh).count : 0), 0);

function show(targets: number) {
  const scene = new THREE.Scene();
  const fx = createFx(scene);
  const s = createSim(floor01, 1);
  s.enemies = [];
  const p = s.players[0];
  const hit = Array.from({ length: targets }, (_, k) => spawnEnemy(s, 'tank', { x: p.pos.x + 2 + (k % 5), z: p.pos.z + Math.floor(k / 5) }));
  const zap: SimEvent = { type: 'discoZap', playerId: p.id, pos: { ...p.pos }, enemies: hit.map(e => e.id), rivals: [], at: hit.map(e => ({ ...e.pos })) };
  const run = (seconds: number, events: SimEvent[] = []) => {
    fx.update(s, events, THEMES.day, DT, 0);
    for (let t = DT; t < seconds; t += DT) fx.update(s, [], THEMES.day, DT, t);
  };
  return { scene, fx, s, zap, run };
}

describe('disco beams', () => {
  it('a beam shoots out of the ball, stands on its target, and its tail follows it in', () => {
    expect(zapSpan(-0.01)).toBeNull();
    expect(zapSpan(0)).toEqual({ from: 0, to: 0 });
    const out = zapSpan(ZAP.out / 2)!;
    expect(out.from).toBe(0);
    expect(out.to).toBeGreaterThan(0);
    expect(out.to).toBeLessThan(1);
    expect(zapSpan(ZAP.out + ZAP.hold / 2)).toEqual({ from: 0, to: 1 });
    const gone = zapSpan(ZAP.out + ZAP.hold + ZAP.in / 2)!;
    expect(gone.to).toBe(1);
    expect(gone.from).toBeGreaterThan(0);
    expect(gone.from).toBeLessThan(1);
    expect(zapSpan(ZAP.out + ZAP.hold + ZAP.in)).toBeNull();
  });
});

describe('disco show', () => {
  it('throws its light while the ball is up, and is gone after', () => {
    const { fx, zap, run } = show(4);
    expect(fx.discoLight().k).toBe(0);
    run(1, [zap]);
    expect(fx.discoLight().k).toBeGreaterThan(0);
    run(DISCO.show);
    expect(fx.discoLight().k).toBe(0);
  });

  it('bursts when its thrower falls: it does not wait for them where they come back', () => {
    const { fx, s, zap, run } = show(4);
    run(1, [zap]);
    expect(fx.discoLight().k).toBeGreaterThan(0);
    s.players[0].downUntil = s.tick + 180;
    run(0.1);
    expect(fx.discoLight().k).toBe(0);
    // (and it stays gone once they are up again)
    s.players[0].downUntil = null;
    run(0.1);
    expect(fx.discoLight().k).toBe(0);
  });

  it('is gone after a cut to another time: a ball thrown in the kill cam does not hang on in the match', () => {
    const { fx, s, zap, run } = show(4);
    run(1, [zap]);
    expect(fx.discoLight().k).toBeGreaterThan(0);
    s.tick += 120;
    run(0.1);
    expect(fx.discoLight().k).toBe(0);
  });

  it('draws from pools that are made once: nothing new comes into the scene while it runs', () => {
    const { scene, zap, run } = show(4);
    const pools = scene.children.length;
    const idle = drawn(scene);
    run(0.5, [zap]);
    expect(drawn(scene)).toBeGreaterThan(idle);
    // (thrown again while it is up: still one ball)
    run(DISCO.show - 1, [zap]);
    expect(scene.children.length).toBe(pools);
    run(DISCO.show + 3);
    expect(scene.children.length).toBe(pools);
    expect(drawn(scene)).toBe(idle);
  });

  it('never draws more beams than its cap, and fewer of everything on low graphics', () => {
    const many = show(60);
    many.run(0.6, [many.zap]);
    const few = show(4);
    few.run(0.6, [few.zap]);
    // each beam is a core and a glow, and a spark on its target
    expect(drawn(many.scene) - drawn(few.scene)).toBeLessThanOrEqual((MAX_DISCO_BEAMS - 4) * 3 + 200);
    const low = show(4);
    low.fx.setParticleScale(0.5);
    low.run(0.6, [low.zap]);
    expect(drawn(low.scene)).toBeLessThan(drawn(few.scene));
  });
});
