import * as THREE from 'three';
import { POWERUP } from '../sim/systems/powerups';
import type { Card, PerkKind, PowerupKind, RareKind, SimState, WeaponKind } from '../sim/types';
import { POWERUP_COLOR } from './fx';
import { glowMat } from './pool';
import type { Theme } from './theme';

export const WEAPON_GLYPH: Record<WeaponKind, string> = {
  pixelBlaster: '✦',
  laserSword: '⚔',
  candyCannon: '🍬',
  hotdogSlinger: '🌭',
  joystickBoomerang: '🪃',
  discoBall: '🪩',
  bananaMine: '🍌',
  bomb: '💣',
  flySwatter: '🪰',
};

export const PERK_GLYPH: Record<PerkKind, string> = {
  speed: '👟',
  dash: '💨',
  magnet: '🧲',
  greed: '💰',
  regen: '💚',
  stomp: '🥾',
};

export const RARE_GLYPH: Record<RareKind, string> = {
  slushMachine: '🧊',
  bubblegumBazooka: '🫧',
  leafBlower: '🍃',
  pizzaCutter: '🍕',
};

const RARE_LABEL: Record<RareKind, string> = {
  slushMachine: 'SLUSH',
  bubblegumBazooka: 'BUBBLEGUM',
  leafBlower: 'BLOWER',
  pizzaCutter: 'PIZZA',
};

export const POWERUP_GLYPH: Record<PowerupKind, string> = {
  magnet: '🧲',
  rapid: '⚡',
  bomb: '💥',
  frost: '❄',
  heart: '❤',
};

const WEAPON_LABEL: Record<WeaponKind, string> = {
  pixelBlaster: 'BLASTER',
  laserSword: 'SWORD',
  candyCannon: 'CANDY',
  hotdogSlinger: 'HOTDOG',
  joystickBoomerang: 'BOOMERANG',
  discoBall: 'DISCO',
  bananaMine: 'BANANA',
  bomb: 'BOMB',
  flySwatter: 'SWATTER',
};

const PERK_LABEL: Record<PerkKind, string> = {
  speed: 'SPEED',
  dash: 'DASH +1',
  magnet: 'MAGNET',
  greed: 'COINS +',
  regen: 'REGEN',
  stomp: 'STOMP',
};

function iconTexture(glyph: string, label: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1440';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = bg;
  ctx.fillRect(8, 8, 112, 144);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '64px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, 64, 66);
  if (label) {
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#fffdf5';
    ctx.fillText(label, 64, 130);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cardKey = (c: Card) => (c.type === 'weapon' ? `w:${c.weapon}` : c.type === 'perk' ? `p:${c.perk}` : `r:${c.rare}`);

function cardTexture(card: Card): THREE.CanvasTexture {
  if (card.type === 'weapon') return iconTexture(WEAPON_GLYPH[card.weapon], WEAPON_LABEL[card.weapon], '#7b4fd1');
  if (card.type === 'perk') return iconTexture(PERK_GLYPH[card.perk], PERK_LABEL[card.perk], '#1f8f6a');
  return iconTexture(RARE_GLYPH[card.rare], RARE_LABEL[card.rare], '#d19a00');
}

export interface Pickups {
  update(s: SimState, theme: Theme, time: number): void;
}

/** Floating choice cards and power-ups: few objects, so plain meshes created and removed as they come and go. */
export function createPickups(scene: THREE.Scene): Pickups {
  const textures = new Map<string, THREE.Texture>();
  const texFor = (key: string, make: () => THREE.Texture) => {
    let t = textures.get(key);
    if (!t) {
      t = make();
      textures.set(key, t);
    }
    return t;
  };
  const cardGeo = new THREE.PlaneGeometry(1.0, 1.25);
  const glowGeo = new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2);
  const cubeGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2);

  const offers = new Map<number, THREE.Group>();
  const powerups = new Map<number, { root: THREE.Group; cube: THREE.Mesh; ring: THREE.Mesh; mat: THREE.MeshStandardMaterial }>();

  return {
    update(s, theme, time) {
      const liveOffers = new Set<number>();
      for (const o of s.offers) {
        liveOffers.add(o.id);
        let g = offers.get(o.id);
        if (!g) {
          g = new THREE.Group();
          o.cards.forEach((card, i) => {
            const tex = texFor(cardKey(card), () => cardTexture(card));
            const glowColor = card.type === 'weapon' ? 0xb07cff : card.type === 'perk' ? 0x3bffb0 : 0xffc928;
            const mesh = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            mesh.rotation.x = -0.75;
            mesh.position.set(o.cardPos[i].x, 1.1, o.cardPos[i].z);
            mesh.userData.phase = i;
            const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.5, depthWrite: false }));
            glow.position.set(o.cardPos[i].x, 0.04, o.cardPos[i].z);
            g!.add(mesh, glow);
          });
          scene.add(g);
          offers.set(o.id, g);
        }
        const armed = s.tick >= o.armedAt;
        const leaving = o.expiresAt - s.tick < 180 && Math.floor(time * 6) % 2 === 0;
        g.visible = !leaving;
        g.children.forEach(child => {
          if (child.userData.phase === undefined) return;
          child.position.y = 1.1 + Math.sin(time * 3 + child.userData.phase * 2) * 0.12;
          child.scale.setScalar(armed ? 1 : 0.6);
        });
      }
      for (const [id, g] of offers) {
        if (liveOffers.has(id)) continue;
        scene.remove(g);
        g.traverse(o => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
        offers.delete(id);
      }

      const livePowerups = new Set<number>();
      for (const pu of s.powerups) {
        livePowerups.add(pu.id);
        let v = powerups.get(pu.id);
        if (!v) {
          const tex = texFor(`pu:${pu.kind}`, () => iconTexture(POWERUP_GLYPH[pu.kind], '', '#1b1440'));
          const mat = glowMat(POWERUP_COLOR[pu.kind], 0.8);
          mat.map = tex;
          mat.emissiveMap = tex;
          mat.color.setHex(0xffffff);
          mat.emissive.setHex(0xffffff);
          const cube = new THREE.Mesh(cubeGeo, mat);
          cube.castShadow = true;
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: POWERUP_COLOR[pu.kind], transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
          ring.position.y = 0.05;
          const root = new THREE.Group();
          root.add(cube, ring);
          root.position.set(pu.pos.x, 0, pu.pos.z);
          scene.add(root);
          v = { root, cube, ring, mat };
          powerups.set(pu.id, v);
        }
        v.cube.position.y = 0.9 + Math.sin(time * 3 + pu.id) * 0.15;
        v.cube.rotation.y = time * 1.5;
        v.ring.scale.setScalar(0.4 + 1.2 * Math.max(0, (pu.expiresAt - s.tick) / POWERUP.lifetimeTicks));
        v.mat.emissiveIntensity = 0.8 * Math.min(theme.glow, 1.4);
      }
      for (const [id, v] of powerups) {
        if (livePowerups.has(id)) continue;
        scene.remove(v.root);
        v.mat.dispose();
        (v.ring.material as THREE.Material).dispose();
        powerups.delete(id);
      }
    },
  };
}
