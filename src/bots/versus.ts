import { WEAPONS } from '../sim/config/weapons';
import { buildFlowField, towerTiles, flowDir } from '../sim/map/flowfield';
import { BLOCKS_WALKER, hasLos } from '../sim/map/tilemap';
import { rivals } from '../sim/systems/versus';
import type { Command, Difficulty, SimState, Vec2 } from '../sim/types';

const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** how far each weapon is worth firing from */
const REACH: Record<string, number> = { pixelBlaster: 9, laserSword: 2.2, candyCannon: 6, hotdogSlinger: 8, bananaMine: 3, bomb: 7, discoBall: 4, joystickBoomerang: 7, flySwatter: 1.6, pixelRail: 12, bubbleWand: 7, magnetGlove: 5, yoyoLauncher: 4.5 };

/**
 * How well a bot plays, from Ultra Low (a beginner) to Ultra High (sharp-eyed, instant):
 * - aimError: how far off it aims, in tiles (a wobble that drifts, not a jitter)
 * - lead: how much it aims ahead of a running target (0 = at where it is now)
 * - reaction: seconds from spotting a rival to the first shot
 * - trigger: the share of moments with a loaded weapon in which it fires
 * - sight: how far it notices rivals, as a share of the full range
 */
export const BOT_SKILL: Record<Difficulty, { aimError: number; lead: number; reaction: number; trigger: number; sight: number }> = {
  ultraLow: { aimError: 2.5, lead: 0, reaction: 0.8, trigger: 0.2, sight: 0.6 },
  low: { aimError: 1.6, lead: 0, reaction: 0.5, trigger: 0.4, sight: 0.75 },
  medium: { aimError: 0.9, lead: 0.5, reaction: 0.33, trigger: 0.65, sight: 0.9 },
  high: { aimError: 0.4, lead: 1, reaction: 0.17, trigger: 0.85, sight: 1 },
  ultraHigh: { aimError: 0, lead: 1, reaction: 0, trigger: 1, sight: 1.1 },
};

/**
 * A versus opponent: walks to the nearest rival it can reach, keeps a fighting distance, strafes, fires the
 * best loaded weapon in reach, and picks up crates when nobody is around. Runs on the host like a player's
 * keyboard; it only reads the state, so it never changes the simulation itself.
 */
export function createVersusBot(id: number, level: Difficulty = 'ultraHigh'): (s: SimState) => Command[] {
  const skill = BOT_SKILL[level];
  // its own dice, the same every match for the same bot
  let seed = (id * 9301 + 49297) >>> 0;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
  /** the aim wobble: a direction and size that drift to a new one every half second */
  let wobble = { x: 0, z: 0 };
  /** when the current target came into view, for the reaction time */
  let spotted: { id: number; at: number } | null = null;
  /** it hesitated: no shot before this tick */
  let hesitateUntil = 0;
  const aim = (point: Vec2): Command => ({ type: 'aim', playerId: id, point: { x: point.x + wobble.x, z: point.z + wobble.z } });
  let field: Int16Array | null = null;
  let fieldKey = '';
  let strafe = 1;
  let wander: Vec2 | null = null;
  let tick = 0;
  /** where each rival was a moment ago, to aim ahead of where it runs */
  const seenAt = new Map<number, Vec2>();
  /** stuck detection: our position a second ago, and a sidestep while we get loose */
  let checkPos: Vec2 | null = null;
  let unstickUntil = 0;
  let unstickDir: Vec2 = { x: 1, z: 0 };

  const go = (s: SimState, pos: Vec2, goal: Vec2): Vec2 => {
    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}`;
    if (key !== fieldKey || !field || tick % 30 === 0) {
      fieldKey = key;
      field = buildFlowField(s.map, [goal], BLOCKS_WALKER, towerTiles(s));
    }
    // close by: walk straight onto it (crates and cards need you right on top of them)
    if (d(goal, pos) < 1.5) return { x: goal.x - pos.x, z: goal.z - pos.z };
    return flowDir(s.map, field, pos);
  };

  return s => {
    tick++;
    if (tick % 30 === 1) {
      const a = rand() * Math.PI * 2, r = skill.aimError * (0.5 + rand() * 0.5);
      wobble = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }
    const p = s.players.find(x => x.id === id);
    if (!p || p.downUntil !== null || !s.versus || s.phase !== 'playing') return [];
    const cmds: Command[] = [];
    // stuck: barely moved for a second while wanting to → sidestep for a moment
    if (tick % 60 === 0) {
      if (checkPos && d(checkPos, p.pos) < 0.4 && p.vehicleId === null) {
        const a = ((tick / 60 + id) % 8) * (Math.PI / 4);
        unstickDir = { x: Math.cos(a), z: Math.sin(a) };
        unstickUntil = tick + 40;
        strafe = -strafe;
        wander = null;
      }
      checkPos = { ...p.pos };
    }
    if (tick < unstickUntil) return [{ type: 'move', playerId: id, dir: unstickDir }];
    const foes = rivals(s, id).sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos));
    // the objective of the mode, if it has one: the king zone, or the cubes
    const v = s.versus;
    let objective: Vec2 | null = null;
    if (v.king) objective = v.king.pos;
    if (v.flags && p.team !== undefined) {
      const own = v.flags[p.team], enemy = v.flags[1 - p.team];
      if (enemy.carrier === p.id) objective = own.base;
      else if (own.carrier === null && d(own.pos, own.base) > 0.5) objective = own.pos;
      else if (enemy.carrier === null) objective = enemy.pos;
      else if (own.carrier !== null) objective = s.players.find(x => x.id === own.carrier)?.pos ?? null;
    }
    // with an objective only fight what is close; a carrier runs home
    const carrying = !!v.flags?.some(f => f.carrier === id);
    const fightRange = (carrying ? 4 : objective ? 9 : 14) * skill.sight;
    const seen = foes.find(f => d(f.pos, p.pos) < fightRange && hasLos(s.map, p.pos, f.pos));
    const target = seen ?? foes[0];
    if (!seen) spotted = null;
    else if (spotted?.id !== seen.id) spotted = { id: seen.id, at: tick };
    // a moment to react after spotting someone, then it pulls the trigger only some of the time
    const mayFire = () => {
      if (!spotted || tick - spotted.at < skill.reaction * 60 || tick < hesitateUntil) return false;
      if (rand() < skill.trigger) return true;
      hesitateUntil = tick + 20;
      return false;
    };

    let move: Vec2;
    if (objective && (!seen || carrying)) {
      move = go(s, p.pos, objective);
      if (seen) {
        cmds.push(aim(seen.pos));
        if ((p.weapons[p.selected]?.cooldown ?? 1) === 0 && mayFire()) cmds.push({ type: 'fire', playerId: id });
      }
    } else if (seen) {
      // fight: hold a distance that suits the weapon, circle a little
      const w = p.weapons[p.selected];
      const want = Math.min(6, (REACH[w?.kind ?? 'pixelBlaster'] ?? 6) * 0.7);
      const dist = d(seen.pos, p.pos);
      const tx = (seen.pos.x - p.pos.x) / dist, tz = (seen.pos.z - p.pos.z) / dist;
      if (tick % 90 === 0) strafe = -strafe;
      const push = dist > want + 1 ? 1 : dist < want - 1 ? -1 : 0;
      move = { x: tx * push - tz * strafe * 0.7, z: tz * push + tx * strafe * 0.7 };
      // lead the target: aim where it will be when the shot gets there
      const before = seenAt.get(seen.id) ?? seen.pos;
      const vx = (seen.pos.x - before.x) * 60, vz = (seen.pos.z - before.z) * 60;
      const flight = Math.min(0.6, dist / 20) * skill.lead;
      cmds.push(aim({ x: seen.pos.x + vx * flight, z: seen.pos.z + vz * flight }));
      // a wall in the strafing direction: turn around
      const side = { x: p.pos.x - tz * strafe * 1.2, z: p.pos.z + tx * strafe * 1.2 };
      if (!hasLos(s.map, p.pos, side)) strafe = -strafe;
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
      if (best >= 0 && mayFire()) {
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
      if (target) cmds.push(aim(target.pos));
    }
    for (const f of foes) seenAt.set(f.id, { ...f.pos });
    const len = Math.hypot(move.x, move.z);
    cmds.push({ type: 'move', playerId: id, dir: len > 1 ? { x: move.x / len, z: move.z / len } : move });
    return cmds;
  };
}
