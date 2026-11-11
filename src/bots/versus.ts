import { WEAPONS } from '../sim/config/weapons';
import { buildFlowField, flowDir } from '../sim/map/flowfield';
import { BLOCKS_WALKER, hasLos } from '../sim/map/tilemap';
import { rivals } from '../sim/systems/versus';
import type { Command, SimState, Vec2 } from '../sim/types';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** how far each weapon is worth firing from */
const REACH: Record<string, number> = { pixelBlaster: 9, laserSword: 2.2, candyCannon: 6, hotdogSlinger: 8, bananaMine: 3, bomb: 7, discoBall: 4, joystickBoomerang: 7 };

/**
 * A versus opponent: walks to the nearest rival it can reach, keeps a fighting distance, strafes, fires the
 * best loaded weapon in reach, and picks up crates when nobody is around. Runs on the host like a player's
 * keyboard; it only reads the state, so it never changes the simulation itself.
 */
export function createVersusBot(id: number): (s: SimState) => Command[] {
  let field: Int16Array | null = null;
  let fieldKey = '';
  let strafe = 1;
  let wander: Vec2 | null = null;
  let tick = 0;

  const go = (s: SimState, pos: Vec2, goal: Vec2): Vec2 => {
    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}`;
    if (key !== fieldKey || !field || tick % 30 === 0) {
      fieldKey = key;
      field = buildFlowField(s.map, [goal], BLOCKS_WALKER);
    }
    // close by: walk straight onto it (crates and cards need you right on top of them)
    if (d(goal, pos) < 1.5) return { x: goal.x - pos.x, z: goal.z - pos.z };
    return flowDir(s.map, field, pos);
  };

  return s => {
    tick++;
    const p = s.players.find(x => x.id === id);
    if (!p || p.downUntil !== null || !s.versus || s.phase !== 'playing') return [];
    const cmds: Command[] = [];
    const foes = rivals(s, id).sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos));
    const seen = foes.find(f => d(f.pos, p.pos) < 14 && hasLos(s.map, p.pos, f.pos));
    const target = seen ?? foes[0];

    let move: Vec2;
    if (seen) {
      // fight: hold a distance that suits the weapon, circle a little
      const w = p.weapons[p.selected];
      const want = Math.min(6, (REACH[w?.kind ?? 'pixelBlaster'] ?? 6) * 0.7);
      const dist = d(seen.pos, p.pos);
      const tx = (seen.pos.x - p.pos.x) / dist, tz = (seen.pos.z - p.pos.z) / dist;
      if (tick % 90 === 0) strafe = -strafe;
      const push = dist > want + 1 ? 1 : dist < want - 1 ? -1 : 0;
      move = { x: tx * push - tz * strafe * 0.7, z: tz * push + tx * strafe * 0.7 };
      cmds.push({ type: 'aim', playerId: id, point: { ...seen.pos } });
      // the best loaded weapon in reach
      let best = -1, bestDmg = 0;
      p.weapons.forEach((wp, i) => {
        if (wp.cooldown > 0 || dist > (REACH[wp.kind] ?? 6)) return;
        const dmg = WEAPONS[wp.kind].damage * wp.level;
        if (dmg > bestDmg) {
          bestDmg = dmg;
          best = i;
        }
      });
      if (best >= 0) {
        if (best !== p.selected) cmds.push({ type: 'select', playerId: id, slot: best });
        cmds.push({ type: 'fire', playerId: id });
      }
      // hop now and then: harder to hit, and a stomp when close
      if (dist < 1.6 || tick % 150 === 0) cmds.push({ type: 'jump', playerId: id });
    } else {
      const crate = s.crates.slice().sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0];
      const card = s.offers.find(o => s.tick >= o.armedAt)?.cardPos[0];
      if (!wander || d(wander, p.pos) < 2 || tick % 600 === 0) wander = s.map.waypoints[(tick + id * 7) % s.map.waypoints.length];
      // a crate only when it is on the way (much closer than the next rival), otherwise go fight
      const crateFirst = crate && (!target || d(crate.pos, p.pos) < d(target.pos, p.pos) * 0.5);
      const goal = card ?? (crateFirst ? crate!.pos : undefined) ?? target?.pos ?? crate?.pos ?? wander;
      move = go(s, p.pos, goal);
      if (target) cmds.push({ type: 'aim', playerId: id, point: { ...target.pos } });
    }
    const len = Math.hypot(move.x, move.z);
    cmds.push({ type: 'move', playerId: id, dir: len > 1 ? { x: move.x / len, z: move.z / len } : move });
    return cmds;
  };
}
