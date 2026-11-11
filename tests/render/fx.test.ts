import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFx } from '../../src/render/fx';
import { THEMES } from '../../src/render/theme';
import { createSim } from '../../src/sim/sim';
import { floor01 } from '../../src/sim/config/floor01';
import type { SimEvent } from '../../src/sim/types';

function shakeAfter(event: SimEvent): number {
  const fx = createFx(new THREE.Scene());
  fx.update(createSim(floor01, 1), [event], THEMES.day, 1 / 60, 0);
  return fx.shake().length();
}

describe('fx screen shake', () => {
  const pos = { x: 5, z: 5 };

  it('shakes for hits, explosions and a falling nest', () => {
    expect(shakeAfter({ type: 'playerHit', playerId: 0, hp: 50 })).toBeGreaterThan(0);
    expect(shakeAfter({ type: 'explosion', pos, radius: 2 })).toBeGreaterThan(0);
    expect(shakeAfter({ type: 'nestDestroyed', id: 1, pos })).toBeGreaterThan(0);
    expect(shakeAfter({ type: 'kartLand', pos })).toBeGreaterThan(0);
  });

  it('stays calm for a stomp or a pickup', () => {
    expect(shakeAfter({ type: 'stomp', pos, radius: 1.2 })).toBe(0);
    expect(shakeAfter({ type: 'powerupPicked', kind: 'heart', playerId: 0 })).toBe(0);
  });
});
