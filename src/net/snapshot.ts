import { FLOORS } from '../sim/config/floors';
import type { Coin, Enemy, EnemyKind, EnemyState, SimState } from '../sim/types';

const KINDS: EnemyKind[] = ['blob', 'hunter', 'tank', 'splitter', 'splitling', 'shooter', 'bomber', 'rammer', 'swarmer'];
const STATES: EnemyState[] = ['move', 'windup', 'charge', 'stunned', 'fuse'];

/** an enemy as a flat array: most of a snapshot is enemies, and objects repeat every key name */
type PackedEnemy = number[];
/** id, x, z, value, expiresAt */
type PackedCoin = [number, number, number, number, number];

/** What a client needs to draw the game, play its sounds and show the HUD. */
export type SnapState = Omit<SnapFields, 'enemies' | 'coins'> & { enemies: PackedEnemy[]; coins: PackedCoin[]; mapId: string };

type SnapFields = Pick<
  SimState,
  | 'tick'
  | 'players'
  | 'enemies'
  | 'projectiles'
  | 'areas'
  | 'mines'
  | 'coins'
  | 'crates'
  | 'offers'
  | 'towers'
  | 'nests'
  | 'blasts'
  | 'vehicles'
  | 'powerups'
  | 'jetpacks'
  | 'bubbles'
  | 'credits'
  | 'alarm'
  | 'elevatorOpen'
  | 'score'
  | 'phase'
  | 'look'
  | 'stats'
  | 'run'
  | 'theme'
>;

function packEnemy(e: Enemy): PackedEnemy {
  return [
    e.id, KINDS.indexOf(e.kind), e.pos.x, e.pos.z, e.hp, e.maxHp, e.radius, e.elite ? 1 : 0, STATES.indexOf(e.state),
    e.stateUntil, e.dir.x, e.dir.z, e.slowUntil, e.frozenUntil, e.stuckUntil, e.chargeLeft, e.hordeId ?? -1,
  ];
}

function unpackEnemy(a: PackedEnemy): Enemy {
  return {
    id: a[0],
    kind: KINDS[a[1]],
    pos: { x: a[2], z: a[3] },
    hp: a[4],
    maxHp: a[5],
    speed: 0,
    radius: a[6],
    elite: a[7] === 1,
    state: STATES[a[8]],
    stateUntil: a[9],
    dir: { x: a[10], z: a[11] },
    slowUntil: a[12],
    frozenUntil: a[13],
    stuckUntil: a[14],
    chargeLeft: a[15],
    hordeId: a[16] < 0 ? null : a[16],
    knock: { x: 0, z: 0 },
    cooldownUntil: 0,
    ramHitUntil: 0,
    chill: 0,
    slamUntil: 0,
  };
}

const packCoin = (c: Coin): PackedCoin => [c.id, c.pos.x, c.pos.z, c.value, c.expiresAt];
const unpackCoin = (a: PackedCoin): Coin => ({ id: a[0], pos: { x: a[1], z: a[2] }, value: a[3], expiresAt: a[4] });

const round = (_key: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0) : v);


/** Strips what clients never use (knockback, timers of other systems) and rounds numbers to keep packets small. */
export function encodeSnapshot(s: SimState): SnapState {
  const snap: SnapState = {
    tick: s.tick,
    players: s.players,
    enemies: s.enemies.map(packEnemy),
    projectiles: s.projectiles.map(p => ({ ...p, hitIds: [] })),
    areas: s.areas,
    mines: s.mines,
    coins: s.coins.map(packCoin),
    crates: s.crates,
    offers: s.offers,
    towers: s.towers,
    nests: s.nests,
    blasts: s.blasts,
    vehicles: s.vehicles,
    powerups: s.powerups,
    jetpacks: s.jetpacks,
    bubbles: s.bubbles,
    credits: s.credits,
    alarm: s.alarm,
    elevatorOpen: s.elevatorOpen,
    score: s.score,
    phase: s.phase,
    look: s.look,
    stats: { ...s.stats, samples: [] },
    run: s.run,
    theme: s.theme,
    mapId: s.map.id,
  };
  return snap;
}

/** The whole snap message as one string, numbers rounded on the way (one pass, sent to every client). */
export function serializeSnapshot(s: SimState, events: unknown[]): string {
  return JSON.stringify({ type: 'snap', state: encodeSnapshot(s), events }, round);
}

/** Puts a snapshot into the client's view of the game. Older snapshots than the one shown are ignored. */
export function applySnapshot(view: SimState, snap: SnapState): boolean {
  if (snap.tick <= view.tick && view.tick > 0) return false;
  const { mapId, ...rest } = snap;
  // a new floor: clients know every map by its id
  if (mapId !== view.map.id && FLOORS[mapId]) view.map = FLOORS[mapId].map;
  Object.assign(view, rest, { enemies: snap.enemies.map(unpackEnemy), coins: snap.coins.map(unpackCoin) });
  return true;
}
