import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { WALDSEE_BARRIERS } from '../../src/sim/config/waldsee-town';
import { BLOCKS_ENEMY, isFree } from '../../src/sim/map/tilemap';
import { createSim, stepSim } from '../../src/sim/sim';
import { LAKE_SHARK, leapAt, watchesLake } from '../../src/sim/systems/lake-shark';
import type { Command, SimState } from '../../src/sim/types';

const LAKE = WALDSEE_BARRIERS.find(b => b.lake)!;
/** a spot `d` tiles out over the barrier toward the lake (negative: back into the lane) */
const out = (d: number) => ({ x: LAKE.at[0] + LAKE.dir[0] * d, z: LAKE.at[1] + LAKE.dir[1] * d });

/** the Town with nobody in it but the player, who stands at the barrier of the police lane */
function atTheLake(): SimState {
  const s = createSim(FLOORS.waldsee.map, 4, { mode: 'quick' });
  s.enemies = [];
  s.hordes = [];
  s.boss = null;
  s.players[0].pos = out(-1.5);
  s.players[0].invulnUntil = 1e9;
  return s;
}
const lookAt = (d: number): Command => ({ type: 'aim', playerId: 0, point: out(d) });
const sharks = (s: SimState) => s.enemies.filter(e => e.kind === 'shark');

describe('the sharks of the Town\'s lake', () => {
  it('are watched by whoever stands at the barrier and looks out over the water', () => {
    const s = atTheLake();
    stepSim(s, [lookAt(12)]);
    expect(watchesLake(s.players[0])).toBe(true);
    stepSim(s, [lookAt(-12)]);
    expect(watchesLake(s.players[0])).toBe(false);
    s.players[0].pos = { ...s.map.spawn };
    stepSim(s, [{ type: 'aim', playerId: 0, point: { x: s.map.spawn.x + LAKE.dir[0] * 9, z: s.map.spawn.z + LAKE.dir[1] * 9 } }]);
    expect(watchesLake(s.players[0])).toBe(false);
  });

  it('one leaps out now and then at a watcher, never at someone who looks away, and then the lake is quiet for a while', () => {
    const s = atTheLake();
    // (every roll comes up)
    s.rng.next = () => 0;
    for (let i = 0; i < LAKE_SHARK.rollTicks * 3; i++) stepSim(s, [lookAt(-12)]);
    expect(sharks(s)).toHaveLength(0);
    let leaps = 0;
    for (let i = 0; i < LAKE_SHARK.rollTicks; i++) {
      stepSim(s, [lookAt(12)]);
      leaps += s.events.filter(e => e.type === 'sharkLeap' && e.playerId === 0).length;
    }
    expect(leaps).toBe(1);
    expect(sharks(s)).toHaveLength(1);
    // squashed at once: still none follows while the lake rests
    sharks(s)[0].hp = 0;
    s.enemies = [];
    for (let i = 0; i < LAKE_SHARK.rollTicks * 4; i++) stepSim(s, [lookAt(12)]);
    expect(sharks(s)).toHaveLength(0);
  });

  it('not every look brings one', () => {
    const s = atTheLake();
    s.rng.next = () => LAKE_SHARK.chance + 0.01;
    for (let i = 0; i < LAKE_SHARK.rollTicks * 5; i++) stepSim(s, [lookAt(12)]);
    expect(sharks(s)).toHaveLength(0);
    expect(LAKE_SHARK.chance).toBeLessThan(0.5);
  });

  it('up to three are out at a time: a fourth stays in the lake until one of them is squashed', () => {
    const s = atTheLake();
    s.rng.next = () => 0;
    const watch = (ticks: number) => {
      for (let i = 0; i < ticks; i++) stepSim(s, [lookAt(12)]);
    };
    watch((LAKE_SHARK.restTicks + LAKE_SHARK.rollTicks) * 5);
    expect(sharks(s).filter(e => e.hp > 0)).toHaveLength(LAKE_SHARK.most);
    const gone = sharks(s)[0];
    s.enemies = s.enemies.filter(e => e !== gone);
    watch(LAKE_SHARK.restTicks + LAKE_SHARK.rollTicks * 2);
    expect(sharks(s).filter(e => e.hp > 0)).toHaveLength(LAKE_SHARK.most);
  });

  it('comes from out in the lake over the barrier, lands in the lane and is after the watcher', () => {
    const s = atTheLake();
    const p = s.players[0];
    p.pos = out(-6);
    leapAt(s, p);
    const shark = sharks(s)[0];
    const along = () => (shark.pos.x - LAKE.at[0]) * LAKE.dir[0] + (shark.pos.z - LAKE.at[1]) * LAKE.dir[1];
    expect(along()).toBeGreaterThan(4);
    for (let i = 0; i < LAKE_SHARK.leapTicks - 2; i++) stepSim(s, []);
    // (in the air it does not swim off on its own)
    expect(shark.leap).toBeDefined();
    for (let i = 0; i < 4; i++) stepSim(s, []);
    expect(shark.leap).toBeUndefined();
    expect(along()).toBeLessThan(0);
    expect(isFree(s.map, shark.pos, 0.3, BLOCKS_ENEMY)).toBe(true);
    // (it circles and lunges as sharks do: within a few seconds it has been at them)
    let nearest = Infinity;
    for (let i = 0; i < 360; i++) {
      stepSim(s, []);
      nearest = Math.min(nearest, Math.hypot(shark.pos.x - p.pos.x, shark.pos.z - p.pos.z));
    }
    expect(nearest).toBeLessThan(1.2);
  });
});
