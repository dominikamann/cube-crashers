import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crowned } from '../sim/systems/bounty';
import type { SimState } from '../sim/types';
import { InstancedPool } from './pool';

/** how high over the floor the crown floats, and the colour of Quad Damage */
const CROWN_Y = 2.25;
export const QUAD_COLOR = 0xc04dff;

/** a crown of voxels: a band with five points */
function crown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = Math.cos(a) * 0.26, z = Math.sin(a) * 0.26;
    parts.push(new THREE.BoxGeometry(0.14, 0.12, 0.14).translate(x, 0, z));
    if (i % 2 === 0) parts.push(new THREE.BoxGeometry(0.1, 0.16, 0.1).translate(x, 0.14, z));
  }
  return mergeGeometries(parts, false);
}

export interface Marks {
  update(s: SimState, time: number): void;
}

/**
 * What everyone should see on a player in a versus match: the crown over whoever leads (there is a bounty on
 * them, see bounty.ts) and the glow of Quad Damage. Drawn from pools that are made once.
 */
export function createMarks(scene: THREE.Scene): Marks {
  const crowns = new InstancedPool(scene, crown(), new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xa86a00, roughness: 0.35, metalness: 0.4, flatShading: true }), 2);
  const glows = new InstancedPool(scene, new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 12, false);
  return {
    update(s, time) {
      crowns.begin();
      glows.begin();
      const leader = crowned(s);
      for (const p of s.players) {
        if (p.downUntil !== null) continue;
        if (p.id === leader) crowns.add(p.pos.x, CROWN_Y + 0.06 * Math.sin(time * 3), p.pos.z, time * 1.5);
        if ((p.quadUntil ?? 0) > s.tick) {
          // (it flickers when it is about to run out)
          const left = (p.quadUntil! - s.tick) / 60, k = left < 3 && Math.floor(time * 8) % 2 === 0 ? 0.5 : 1;
          glows.add(p.pos.x, 0.9, p.pos.z, time * 2, (1.9 + 0.2 * Math.sin(time * 10)) * k, QUAD_COLOR);
          glows.add(p.pos.x, 0.9, p.pos.z, -time * 3, 1.3 * k, 0xff7bff);
        }
      }
      crowns.end();
      glows.end();
    },
  };
}
