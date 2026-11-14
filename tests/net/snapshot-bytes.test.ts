import { expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { floor01 } from '../../src/sim/config/floor01';
import { createSim, stepSim } from '../../src/sim/sim';
import { encodeSnapshot, serializeSnapshot } from '../../src/net/snapshot';

const round = (_key: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0) : v);

it('writes a snapshot byte for byte as one pass of JSON.stringify would', () => {
  for (const [map, mode, players] of [[floor01, 'run', 4], [FLOORS.waldsee.map, 'quick', 2], [FLOORS.underwater.map, 'quick', 3], [FLOORS.arena.map, 'brawl', 3]] as const) {
    const s = createSim(map, 11, { mode, players, names: ['a"b', 'c\\\\d', 'é', 'x'].slice(0, players) });
    for (let i = 0; i < 700; i++) {
      stepSim(s, []);
      for (const p of s.players) p.hp = p.maxHp;
      if (i % 97 === 0) {
        const events = [...s.events];
        expect(serializeSnapshot(s, events)).toBe(JSON.stringify({ type: 'snap', state: encodeSnapshot(s), events }, round));
      }
    }
    // (numbers a float can throw up: they go out as JSON would write them)
    if (s.enemies[0]) Object.assign(s.enemies[0].pos, { x: -0, z: 1e-9 }), (s.enemies[0].hp = NaN), (s.enemies[0].stateUntil = 1e21);
    expect(serializeSnapshot(s, [])).toBe(JSON.stringify({ type: 'snap', state: encodeSnapshot(s), events: [] }, round));
    expect(s.enemies.length).toBeGreaterThan(0);
  }
}, 60_000);
