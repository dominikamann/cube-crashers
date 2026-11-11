import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFx } from '../../src/render/fx';
import { THEMES } from '../../src/render/theme';
import { createSim } from '../../src/sim/sim';
import { floor01 } from '../../src/sim/config/floor01';

describe('fx', () => {
  it('shakes the screen when the player is hit', () => {
    const fx = createFx(new THREE.Scene());
    fx.update(createSim(floor01, 1), [{ type: 'playerHit', playerId: 0, hp: 50 }], THEMES.day, 1 / 60);
    expect(fx.shake().length()).toBeGreaterThan(0);
  });
});
