import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOT_ANTENNAS, BOT_CHASSIS, BOT_FACES, CHARACTERS, type Look } from '../../src/characters';
import { animate, buildFigure, MODELS, type Pose } from '../../src/render/cast';

const LOOKS: Look[] = [
  ...CHARACTERS.map(kind => ({ kind, bot: false, face: 0, antenna: 0 })),
  ...BOT_CHASSIS.flatMap(kind => Array.from({ length: BOT_FACES }, (_, face) => ({ kind, bot: true, face, antenna: face % BOT_ANTENNAS }))),
];
const REST: Pose = { t: 1, step: 0, pace: 0, ahead: 0, aside: 0, idle: 0, air: false, land: 0, dash: 0, down: false, driving: false, climbing: false, win: false, kick: 0 };

describe('the cast', () => {
  it('has a model for every character and every bot chassis', () => {
    for (const kind of [...CHARACTERS, ...BOT_CHASSIS]) expect(MODELS[kind], kind).toBeDefined();
  });

  it('builds every figure about the same size, standing on the floor', () => {
    for (const look of LOOKS) {
      const f = buildFigure(look, 0x3d8bfd);
      animate(f, REST);
      f.parts.body.position.y = 0;
      f.parts.body.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(f.parts.body);
      expect(box.min.y, look.kind).toBeGreaterThan(-0.05);
      expect(box.min.y, look.kind).toBeLessThan(0.45);
      expect(box.max.y, look.kind).toBeGreaterThan(1.0);
      expect(box.max.y, look.kind).toBeLessThan(2.0);
      // no wider than a tile and a bit (the dino's tail and head reach further along its length)
      expect(box.max.x - box.min.x, look.kind).toBeLessThan(1.35);
      expect(box.max.z - box.min.z, look.kind).toBeLessThan(look.kind === 'babyDino' ? 1.9 : 1.35);
    }
  });

  it('keeps every figure cheap: a handful of merged meshes, however many boxes it is made of', () => {
    for (const look of LOOKS) {
      const { cost } = buildFigure(look, 0xff5a5f);
      expect(cost.meshes, look.kind).toBeLessThanOrEqual(16);
    }
  });

  it('moves every figure through every state without breaking it', () => {
    const states: Partial<Pose>[] = [{}, { pace: 1, step: 2, ahead: 1 }, { air: true }, { land: 1 }, { dash: 1 }, { down: true }, { driving: true }, { climbing: true }, { win: true }, { kick: 1 }, { idle: 6 }];
    for (const look of LOOKS) {
      const f = buildFigure(look, 0x3bd16f);
      for (const st of states) {
        animate(f, { ...REST, ...st });
        f.parts.body.traverse(o => {
          for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z]) expect(Number.isFinite(v), look.kind).toBe(true);
        });
      }
    }
  });

  it('shows the player\'s colour on every figure', () => {
    const hue = new THREE.Color(0xff5a5f);
    for (const look of LOOKS) {
      const f = buildFigure(look, 0xff5a5f);
      // by surface: how much of the figure is the colour itself or a shade of it (red well above green and blue)
      let tinted = 0, all = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      f.parts.body.traverse(o => {
        const g = (o as THREE.Mesh).geometry;
        const col = g?.getAttribute('color'), pos = g?.getAttribute('position'), index = g?.getIndex();
        if (!col || !pos || !index) return;
        for (let i = 0; i < index.count; i += 3) {
          const v = index.getX(i);
          const area = new THREE.Triangle(a.fromBufferAttribute(pos, v), b.fromBufferAttribute(pos, index.getX(i + 1)), c.fromBufferAttribute(pos, index.getX(i + 2))).getArea();
          all += area;
          if (col.getX(v) > 0.25 && col.getY(v) < col.getX(v) * (hue.g / hue.r) * 1.6 + 0.02 && col.getZ(v) < col.getX(v) * (hue.b / hue.r) * 1.6 + 0.02) tinted += area;
        }
      });
      // (Dominik is himself: he wears the colour on his sleeves and his headband only)
      expect(tinted / all, look.kind).toBeGreaterThan(look.kind === 'dominik' ? 0.04 : 0.12);
    }
  });
});
