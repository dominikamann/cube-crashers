import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';

/** a lane with a barrier across it and a ramp up to it from the west */
const MAP = parseMap('hop', ['##############', '#S....^=....E#', '##############']);

function walkEast(from: { x: number; z: number }, ticks: number) {
  const s = createSim(MAP, 1, { mode: 'quick' });
  s.enemies = [];
  s.hordes = [];
  s.boss = null;
  s.players[0].pos = { ...from };
  s.players[0].invulnUntil = 1e9;
  for (let i = 0; i < ticks; i++) stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
  return s.players[0];
}

describe('a ramp up to a barrier', () => {
  it('a player running up it hops over the barrier of itself', () => {
    expect(walkEast({ x: 2.5, z: 1.5 }, 120).pos.x).toBeGreaterThan(8.5);
  });

  it('a barrier with no ramp before it still stops whoever walks into it', () => {
    const s = createSim(parseMap('wall', ['##########', '#S...=..E#', '##########']), 1, { mode: 'quick' });
    s.enemies = [];
    s.hordes = [];
    s.boss = null;
    s.players[0].invulnUntil = 1e9;
    for (let i = 0; i < 120; i++) stepSim(s, [{ type: 'move', playerId: 0, dir: { x: 1, z: 0 } }]);
    expect(s.players[0].pos.x).toBeLessThan(5);
  });
});
