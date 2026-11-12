import { buildFlowField, towerTiles, flowDir } from '../../src/sim/map/flowfield';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos } from '../../src/sim/map/tilemap';
import { padAt } from '../../src/sim/systems/towers';
import { RACE_CHECKPOINTS } from '../../src/sim/config/floor-race';
import { TOWERS } from '../../src/sim/config/towers';
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
  let crateId = -1;

  return s => {
    const p = s.players[0];
    if (s.run.stage === 'shop') {
      // buy whatever is affordable, then go
      const offers = s.run.shop!.offers[p.id] ?? [];
      const i = offers.findIndex(o => !o.sold && o.cost <= p.coins && o.kind !== 'credit');
      return i >= 0 ? [{ type: 'buy', playerId: 0, offer: i }] : [{ type: 'ready', playerId: 0 }];
    }
    if (p.downUntil !== null) return [];
    if (s.run.stage === 'race' && s.run.race) {
      // Kart Rally: drive round the checkpoints (flow field to the next one, the kart avoids the walls)
      const c = RACE_CHECKPOINTS[s.run.race.next[p.id] ?? 1];
      const target = { x: (c.x0 + c.x1 + 1) / 2, z: (c.z0 + c.z1 + 1) / 2 };
      const key = `race:${target.x},${target.z}`;
      if (key !== fieldKey || !field) {
        fieldKey = key;
        field = buildFlowField(s.map, [target], BLOCKS_WALKER);
      }
      return [{ type: 'move', playerId: 0, dir: flowDir(s.map, field, p.pos) }];
    }
    if (s.run.stage === 'maze' && s.run.maze) {
      // Glitch Maze: head for the nearest pixel, run from a ghost that gets close (unless powered up)
      const maze = s.run.maze;
      const powered = s.tick < maze.powerUntil;
      const ghost = s.enemies.filter(e => e.kind === 'ghost').sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0];
      if (ghost && !powered && d(ghost.pos, p.pos) < 3) {
        const len = d(ghost.pos, p.pos) || 1;
        return [{ type: 'move', playerId: 0, dir: { x: (p.pos.x - ghost.pos.x) / len, z: (p.pos.z - ghost.pos.z) / len } }];
      }
      let best = -1, bestD = Infinity;
      for (const i of maze.pixels) {
        const dd = Math.abs((i % s.map.w) + 0.5 - p.pos.x) + Math.abs(Math.floor(i / s.map.w) + 0.5 - p.pos.z);
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      if (best < 0) return [];
      const target = { x: (best % s.map.w) + 0.5, z: Math.floor(best / s.map.w) + 0.5 };
      const key = `maze:${best}`;
      if (key !== fieldKey || !field) {
        fieldKey = key;
        field = buildFlowField(s.map, [target], BLOCKS_WALKER);
      }
      const close = d(target, p.pos) < 1.2;
      return [{ type: 'move', playerId: 0, dir: close ? { x: target.x - p.pos.x, z: target.z - p.pos.z } : flowDir(s.map, field, p.pos) }];
    }
    const cmds: Command[] = [];
    const enemies = s.enemies.filter(e => e.hp > 0);
    const near = enemies.map(e => ({ e, d: d(e.pos, p.pos) })).sort((a, b) => a.d - b.d);

    // where to go
    const live = s.nests.filter(n => n.state !== 'destroyed');
    const nest = live.filter(n => n.state === 'planted').sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0]
      ?? live.sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0];
    const card = s.offers.flatMap(o => (s.tick >= o.armedAt ? [o.cardPos[0]] : [])).sort((a, b) => d(a, p.pos) - d(b, p.pos))[0];
    // once a crate is chosen the bot sticks with it, otherwise it would flip between goals at the range limit
    if (!s.crates.some(c => c.id === crateId)) {
      crateId = s.crates.find(c => d(c.pos, p.pos) < 8)?.id ?? -1;
    }
    const crate = s.crates.find(c => c.id === crateId)?.pos;
    let goal: Vec2;
    if (card && d(card, p.pos) < 14) goal = card;
    else if (crate) goal = crate;
    else if (s.elevatorOpen) goal = s.map.elevator;
    else if (nest) goal = nest.pos;
    else goal = s.map.spawn;

    // towers are solid: the way round them (rebuilt when one goes up or down)
    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}:${s.towers.length}`;
    if (key !== fieldKey || !field) {
      fieldKey = key;
      field = buildFlowField(s.map, [goal], BLOCKS_ENEMY, towerTiles(s));
    }

    let move = { x: 0, z: 0 };
    const atNest = nest && goal === nest.pos && d(nest.pos, p.pos) < 2.2;
    const holding = nest && goal === nest.pos && nest.state === 'planted' && d(nest.pos, p.pos) < 4.5;
    if (atNest && nest.state === 'idle') {
      cmds.push({ type: 'hold', playerId: 0 });
    } else if (holding) {
      // keep circling inside the zone (the nest blasts whoever stands still) and lean away from what is close
      const rx = p.pos.x - nest.pos.x, rz = p.pos.z - nest.pos.z;
      const r = Math.hypot(rx, rz) || 1;
      const pull = (3.2 - r) * 0.8;
      move = { x: -rz / r + (rx / r) * pull, z: rx / r + (rz / r) * pull };
      const threat = near[0];
      if (threat && threat.d < 2.5) {
        move.x += ((p.pos.x - threat.e.pos.x) / threat.d) * 0.8;
        move.z += ((p.pos.z - threat.e.pos.z) / threat.d) * 0.8;
      }
    } else {
      move = d(goal, p.pos) < 1.2 ? { x: goal.x - p.pos.x, z: goal.z - p.pos.z } : flowDir(s.map, field, p.pos);
    }
    cmds.push({ type: 'move', playerId: 0, dir: move });

    // build a tower when standing on a free pad with coins to spare
    const pad = padAt(s, p.pos);
    if (pad !== null && p.coins >= TOWERS.laser.cost && !s.towers.some(t => t.padId === pad)) {
      cmds.push({ type: 'build', playerId: 0, padId: pad, tower: 'laser' });
    }
    // stay on the pad and hold E until the tower stands
    const site = pad === null ? undefined : s.towers.find(t => t.padId === pad && t.buildLeft > 0);
    if (site && !(near[0] && near[0].d < 4)) {
      cmds[cmds.findIndex(c => c.type === 'move')] = { type: 'move', playerId: 0, dir: { x: 0, z: 0 } };
      cmds.push({ type: 'hold', playerId: 0 });
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
