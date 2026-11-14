import { buildFlowField, towerTiles, flowDir } from '../../src/sim/map/flowfield';
import { BLOCKS_ENEMY, BLOCKS_WALKER, hasLos } from '../../src/sim/map/tilemap';
import { padAt } from '../../src/sim/systems/towers';
import { MAZE_DOTS } from '../../src/sim/config/floor-maze';
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
  // which way round it circles a boss, and whether its last step round it got nowhere (a wall: the other way then)
  let circle = 1;
  let circling = false;
  let lastPos: Vec2 | null = null;

  return s => {
    const p = s.players[0];
    if (circling && lastPos && d(lastPos, p.pos) < 0.01) circle = -circle;
    circling = false;
    lastPos = { ...p.pos };
    if (s.run.stage === 'shop') {
      // what keeps it alive first (a heal when hurt, a life when few are left), then whatever else is affordable
      const shop = s.run.shop!;
      const offers = shop.offers[p.id] ?? [];
      const can = (kind: string) => offers.findIndex(o => o.kind === kind && !o.sold && o.cost <= p.coins);
      const want = [p.hp < p.maxHp * 0.7 ? can('heal') : -1, (p.lives ?? 0) <= 2 && !shop.creditSold ? can('credit') : -1, can('weapon'), can('perk')];
      const i = want.find(x => x >= 0) ?? -1;
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
      // Glitch Maze: the shortest way to a pixel that keeps clear of the ghosts (the maze has no clock: a bot
      // that walks into them is sent back to the start for ever), straight at them while powered up
      const maze = s.run.maze;
      const powered = s.tick < maze.powerUntil;
      const ghosts = s.enemies.filter(e => e.kind === 'ghost');
      const dots = maze.pixels.map(i => ({ x: MAZE_DOTS[i].x + 0.5, z: MAZE_DOTS[i].z + 0.5 }));
      if (dots.length === 0) return [];
      // a pixel lies where four tiles meet: walking by the middle of one of them collects it
      const near = dots.reduce((a, c) => (d(c, p.pos) < d(a, p.pos) ? c : a));
      if (d(near, p.pos) < 1.2) return [{ type: 'move', playerId: 0, dir: { x: near.x - p.pos.x, z: near.z - p.pos.z } }];
      const key = `maze:${Math.floor(s.tick / 10)}`;
      if (key !== fieldKey || !field) {
        fieldKey = key;
        const danger = new Set<number>();
        if (!powered)
          for (const g of ghosts)
            for (let oz = -3; oz <= 3; oz++)
              for (let ox = -3; ox <= 3; ox++) {
                const tx = Math.floor(g.pos.x) + ox, tz = Math.floor(g.pos.z) + oz;
                if (Math.hypot(tx + 0.5 - g.pos.x, tz + 0.5 - g.pos.z) <= 3 && (tx !== Math.floor(p.pos.x) || tz !== Math.floor(p.pos.z))) danger.add(tz * s.map.w + tx);
              }
        field = buildFlowField(s.map, dots, BLOCKS_WALKER, danger);
      }
      const way = flowDir(s.map, field, p.pos);
      if (way.x !== 0 || way.z !== 0) return [{ type: 'move', playerId: 0, dir: way }];
      // no way that is clear: away from the nearest ghost
      const ghost = ghosts.sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos))[0];
      if (!ghost) return [];
      const len = d(ghost.pos, p.pos) || 1;
      return [{ type: 'move', playerId: 0, dir: { x: (p.pos.x - ghost.pos.x) / len, z: (p.pos.z - ghost.pos.z) / len } }];
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
    // (the Schrättele is beaten and the elevator waits for the little Schrättele out in the Town: after them)
    else if (s.witchlingsWait && s.enemies.some(e => e.kind === 'witchling' && e.hordeId !== null && e.hp > 0))
      goal = s.enemies.filter(e => e.kind === 'witchling' && e.hordeId !== null && e.hp > 0).reduce((a, e) => (d(e.pos, p.pos) < d(a.pos, p.pos) ? e : a)).pos;
    else goal = s.map.spawn;

    // towers are solid: the way round them (rebuilt when one goes up or down)
    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}:${s.towers.length}`;
    if (key !== fieldKey || !field) {
      fieldKey = key;
      field = buildFlowField(s.map, [goal], BLOCKS_ENEMY, towerTiles(s));
    }

    let move = { x: 0, z: 0 };
    // a boss floor has no nest: keep the boss at shooting range and circle it
    // (of the Segment Worm: any segment still alive, of whichever worm it has split into)
    const bossIds = s.boss ? (s.boss.enemyId !== null ? [s.boss.enemyId] : s.boss.worms.flat()) : [];
    const boss = s.enemies.find(e => bossIds.includes(e.id) && e.hp > 0);
    const atNest = nest && goal === nest.pos && d(nest.pos, p.pos) < 2.2;
    const holding = nest && goal === nest.pos && nest.state === 'planted' && d(nest.pos, p.pos) < 4.5;
    if (atNest && nest.state === 'idle') {
      cmds.push({ type: 'hold', playerId: 0 });
    } else if (holding) {
      // keep circling inside the zone (a moving target for the rushes) and lean away from what is close
      const rx = p.pos.x - nest.pos.x, rz = p.pos.z - nest.pos.z;
      const r = Math.hypot(rx, rz) || 1;
      const pull = (3.2 - r) * 0.8;
      move = { x: -rz / r + (rx / r) * pull, z: rx / r + (rz / r) * pull };
      const threat = near[0];
      if (threat && threat.d < 2.5) {
        move.x += ((p.pos.x - threat.e.pos.x) / threat.d) * 0.8;
        move.z += ((p.pos.z - threat.e.pos.z) / threat.d) * 0.8;
      }
    } else if (boss && !card && !crate && !s.elevatorOpen) {
      const rx = p.pos.x - boss.pos.x, rz = p.pos.z - boss.pos.z;
      const r = Math.hypot(rx, rz) || 1;
      if (r > 8) move = flowDir(s.map, buildFlowField(s.map, [boss.pos], BLOCKS_ENEMY, towerTiles(s)), p.pos);
      else {
        const pull = (6 - r) * 0.6;
        move = { x: (-rz / r) * circle + (rx / r) * pull, z: (rx / r) * circle + (rz / r) * pull };
        circling = true;
      }
    } else {
      move = d(goal, p.pos) < 1.2 ? { x: goal.x - p.pos.x, z: goal.z - p.pos.z } : flowDir(s.map, field, p.pos);
    }
    // out of a marked area before it goes off (a boss's strike, a coconut, a stomp): the one thing every
    // player learns first
    // (and out of a fire on the floor: the witch's bonfire and the twigs burning where they fell)
    const witch = s.boss?.witch;
    const fires = witch ? [{ pos: witch.fire, radius: witch.heat + 0.3, at: 0 }, ...witch.embers.filter(e => e.from <= s.tick + 20).map(e => ({ pos: e.pos, radius: e.radius, at: e.from }))] : [];
    const blast = [...s.blasts.filter(b => !b.hidden), ...fires].filter(b => d(b.pos, p.pos) < b.radius + 0.4).sort((a, b) => a.at - b.at)[0];
    if (blast) {
      const bx = p.pos.x - blast.pos.x, bz = p.pos.z - blast.pos.z, bl = Math.hypot(bx, bz);
      // (standing in its very middle: any way out will do, the one it was walking first)
      const ml = Math.hypot(move.x, move.z);
      const on = ml > 0.05 ? { x: move.x / ml, z: move.z / ml } : { x: 1, z: 0 };
      // (mostly straight out of it, a little the way it was going, so it does not back into what it kept away from)
      move = bl > 0.05 ? { x: bx / bl + on.x * 0.5, z: bz / bl + on.z * 0.5 } : on;
    }
    // up on a wall top (a jump took it there) the way along the floor says nothing: step off toward the goal
    if (p.perched && move.x === 0 && move.z === 0) move = { x: goal.x - p.pos.x, z: goal.z - p.pos.z };
    cmds.push({ type: 'move', playerId: 0, dir: move });

    // build a tower when standing on a free pad with coins to spare
    const pad = padAt(s, p.pos);
    // (not inside a nest's zone: towers are solid and would block the circle the bot runs there)
    const inZone = s.nests.some(n => n.state !== 'destroyed' && d(n.pos, p.pos) < 5);
    if (pad !== null && !inZone && p.coins >= TOWERS.laser.cost && !s.towers.some(t => t.padId === pad)) {
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
    // held down by the witch: jump and jump again to shake her off
    if (witch?.press?.playerId === p.id) {
      if (s.tick % 8 === 0) cmds.push({ type: 'jump', playerId: 0 });
      return cmds;
    }
    const crowd = near.filter(n => n.d < 1.6).length;
    if (crowd >= 3 && p.dashCharges > 0 && maxDashCharges(p) > 0) cmds.push({ type: 'dash', playerId: 0 });
    else if (crowd >= 1 && p.air === 0) cmds.push({ type: 'jump', playerId: 0 });
    return cmds;
  };
}
