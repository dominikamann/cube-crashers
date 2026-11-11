import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { TOWERS } from '../../src/sim/config/towers';
import { createSim, stepSim } from '../../src/sim/sim';
import { tryBuild, tryUpgrade } from '../../src/sim/systems/towers';
import { VERSUS } from '../../src/sim/systems/versus';
import type { SimState } from '../../src/sim/types';

function withTower(mode: 'ffa' | 'team' = 'ffa'): SimState {
  const s = createSim(floorNeon, 7, { mode: 'versus', players: 2, versus: { mode, rule: 'score' } });
  const owner = s.players[0];
  const pad = s.map.pads[0];
  owner.pos = { ...pad.pos };
  owner.coins = 500;
  tryBuild(s, owner.id, pad.id, 'laser');
  s.towers[0].buildLeft = 0;
  return s;
}

describe('towers in versus', () => {
  it('a laser tower shoots the rivals of its owner, with a third of its monster damage', () => {
    const s = withTower();
    const t = s.towers[0];
    expect(t.ownerId).toBe(0);
    const rival = s.players[1];
    rival.pos = { x: t.pos.x + 2, z: t.pos.z };
    rival.invulnUntil = 0;
    s.players[0].pos = { x: t.pos.x - 1, z: t.pos.z };
    stepSim(s, []);
    expect(rival.hp).toBeCloseTo(100 - TOWERS.laser.damage * VERSUS.towerScale, 5);
    expect(s.players[0].hp).toBe(100);
  });

  it('leaves teammates alone', () => {
    const s = withTower('team');
    s.players[1].team = s.players[0].team;
    const t = s.towers[0];
    s.players[1].pos = { x: t.pos.x + 2, z: t.pos.z };
    s.players[1].invulnUntil = 0;
    for (let i = 0; i < 60; i++) stepSim(s, []);
    expect(s.players[1].hp).toBe(100);
  });

  it('one tower per player: a new one replaces the old', () => {
    const s = withTower();
    const owner = s.players[0];
    const pad = s.map.pads[1];
    owner.pos = { ...pad.pos };
    tryBuild(s, owner.id, pad.id, 'frost');
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0].kind).toBe('frost');
  });

  it('no upgrades in versus', () => {
    const s = withTower();
    const owner = s.players[0];
    owner.pos = { ...s.towers[0].pos };
    tryUpgrade(s, owner.id, s.towers[0].padId);
    expect(s.towers[0].level).toBe(1);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'upgradeDenied', reason: 'maxLevel' }));
  });
});
