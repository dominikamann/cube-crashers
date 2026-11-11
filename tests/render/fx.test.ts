import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFx } from '../../src/render/fx';
import { THEMES } from '../../src/render/theme';
import { createSim } from '../../src/sim/sim';
import { map01 } from '../../src/sim/config/map01';

describe('fx', () => {
  it('shakes the screen when a boss arrives', () => {
    const fx = createFx(new THREE.Scene());
    fx.update(createSim(map01, 1), [{ type: 'bossSpawn', kind: 'worm' }], THEMES.day, 1 / 60);
    expect(fx.shake().length()).toBeGreaterThan(0);
  });
});
