import { buildFlowField, flowDir } from '../../src/sim/map/flowfield';
import { BLOCKS_ENEMY, hasLos } from '../../src/sim/map/tilemap';
import { padAt } from '../../src/sim/systems/towers';
import { maxDashCharges } from '../../src/sim/systems/player';
import type { Command, SimState, Vec2, WeaponKind } from '../../src/sim/types';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** heavy weapons first, so the bot fires whatever is loaded */
const PRIORITY: { kind: WeaponKind; range: number }[] = [
  { kind: 'bomb', range: 7 },
  { kind: 'hotdogSlinger', range: 8 },
  { kind: 'discoBall', range: 5 },
  { kind: 'bananaMine', range: 2.5 },
  { kind: 'joystickBoomerang', range: 7 },
  { kind: 'laserSword', range: 2.4 },
  { kind: 'candyCannon', range: 5 },
  { kind: 'pixelBlaster', range: 9 },
];

/**
 * A simple scripted player for smoke and balance tests: walks to the nearest nest, plants, holds,
 * shoots what it sees with whatever weapon is loaded, dodges when crowded, and takes the elevator.
 */
export function createBot(): (s: SimState) => Command[] {
  let fieldKey = '';
  let field: Int16Array | null = null;

  return s => {
    const p = s.players[0];
    if (p.downUntil !== null) return [];
    const cmds: Command[] = [];
    const enemies = s.enemies.filter(e => e.hp > 0);
    const near = enemies.map(e => ({ e, d: d(e.pos, p.pos) })).sort((a, b) => a.d - b.d);

    // where to go
    const live = s.nests.filter(n => n.state !== 'destroyed');
    const nest = live.filter(n => n.state === 'planted').sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0]
      ?? live.sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0];
    const card = s.offers.flatMap(o => (s.tick >= o.armedAt ? [o.cardPos[0]] : [])).sort((a, b) => d(a, p.pos) - d(b, p.pos))[0];
    let goal: Vec2;
    if (card && d(card, p.pos) < 14) goal = card;
    else if (s.elevatorOpen) goal = s.map.elevator;
    else if (nest) goal = nest.pos;
    else goal = s.map.spawn;

    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}`;
    if (key !== fieldKey || !field) {
      fieldKey = key;
      field = buildFlowField(s.map, [goal], BLOCKS_ENEMY);
    }

    let move = { x: 0, z: 0 };
    const atNest = nest && goal === nest.pos && d(nest.pos, p.pos) < 2.2;
    const holding = nest && goal === nest.pos && nest.state === 'planted' && d(nest.pos, p.pos) < 4.5;
    if (atNest && nest.state === 'idle') {
      cmds.push({ type: 'hold', playerId: 0 });
    } else if (holding) {
      // stay in the zone, but back away from whatever is closest
      const threat = near[0];
      if (threat && threat.d < 3) move = { x: p.pos.x - threat.e.pos.x, z: p.pos.z - threat.e.pos.z };
    } else {
      move = d(goal, p.pos) < 1.2 ? { x: goal.x - p.pos.x, z: goal.z - p.pos.z } : flowDir(s.map, field, p.pos);
    }
    cmds.push({ type: 'move', playerId: 0, dir: move });

    // build a tower when standing on a free pad with coins to spare
    const pad = padAt(s, p.pos);
    if (pad !== null && p.coins >= 12 && !s.towers.some(t => t.padId === pad)) {
      cmds.push({ type: 'build', playerId: 0, padId: pad, tower: 'laser' });
    }

    // fight
    const target = near.find(n => n.d < 9 && hasLos(s.map, p.pos, n.e.pos));
    if (target) {
      cmds.push({ type: 'aim', playerId: 0, point: target.e.pos });
      const pick = PRIORITY.map(pr => ({ pr, slot: p.weapons.findIndex(w => w.kind === pr.kind) }))
        .find(x => x.slot >= 0 && p.weapons[x.slot].cooldown === 0 && target.d <= x.pr.range);
      if (pick) {
        cmds.push({ type: 'select', playerId: 0, slot: pick.slot });
        if (p.selected === pick.slot) cmds.push({ type: 'fire', playerId: 0 });
      }
    }
    const crowd = near.filter(n => n.d < 1.6).length;
    if (crowd >= 3 && p.dashCharges > 0 && maxDashCharges(p) > 0) cmds.push({ type: 'dash', playerId: 0 });
    else if (crowd >= 1 && p.air === 0) cmds.push({ type: 'jump', playerId: 0 });
    return cmds;
  };
}
