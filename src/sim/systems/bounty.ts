import { TICK_RATE, type Player, type SimState, type Vec2 } from '../types';
import { dist } from '../util';
import { dropCoins } from './combat';
import { spotClear } from './ground';

/**
 * What makes a kill count for more in a versus match where kills score (score race, coin-op chaos): the
 * bounty on whoever leads, a run of kills that everyone hears about, revenge, two kills in a row. And for every
 * versus match: Quad Damage, which shows up at the same spot again and again and draws everyone there.
 */
export const BOUNTY = {
  /** a run of this many kills without falling is announced to everyone */
  streaks: [3, 5, 7],
  /** from this score on the one in the lead carries the crown (and only while they lead alone) */
  minLead: 3,
  /** what whoever takes the crown gets on top, and what the fallen leader leaves on the floor */
  points: 1,
  coins: 8,
  /** a second kill within this time is a double kill */
  doubleTicks: 3 * TICK_RATE,
  /** Quad Damage: when it first shows, how often after, how long it lies there and how long it lasts */
  quadFirstTicks: 30 * TICK_RATE,
  quadEveryTicks: 45 * TICK_RATE,
  quadLifeTicks: 30 * TICK_RATE,
  quadTicks: 15 * TICK_RATE,
  quad: 4,
};

/** whether kills score in this match */
const scores = (s: SimState): boolean => s.versus?.rule === 'score' || s.versus?.rule === 'coinop';

/** who carries the crown: the one who leads alone with at least `minLead` points (null: nobody) */
export function crowned(s: SimState): number | null {
  const v = s.versus;
  if (!v || !scores(s)) return null;
  let best = -1, top = BOUNTY.minLead - 1, tie = false;
  for (const p of s.players) {
    const n = v.scores[p.id] ?? 0;
    if (n > top) {
      top = n;
      best = p.id;
      tie = false;
    } else if (n === top) tie = true;
  }
  return best >= 0 && !tie ? best : null;
}

/** how much more a hit of this player counts right now (Quad Damage) */
export const quadOf = (s: SimState, id: number | undefined): number => (id !== undefined && (s.players.find(p => p.id === id)?.quadUntil ?? 0) > s.tick ? BOUNTY.quad : 1);

/**
 * `killer` took `victim` out (`leader`: who carried the crown before the kill was scored): the points the kill
 * brings on top of its own, each said to everyone.
 */
export function killBonus(s: SimState, killer: Player, victim: Player, leader: number | null): number {
  const v = s.versus!;
  if (!scores(s)) return 0;
  const say = (kind: 'bounty' | 'streakEnded' | 'revenge' | 'double') => s.events.push({ type: 'killBonus', kind, killerId: killer.id, victimId: victim.id });
  const streaks = (v.streaks ??= {}), lastKiller = (v.lastKiller ??= {}), lastKillAt = (v.lastKillAt ??= {});
  let bonus = 0;
  if (leader === victim.id) {
    bonus += BOUNTY.points;
    dropCoins(s, victim.pos, BOUNTY.coins);
    say('bounty');
  }
  if ((streaks[victim.id] ?? 0) >= BOUNTY.streaks[0]) {
    bonus++;
    say('streakEnded');
  }
  if (lastKiller[killer.id] === victim.id) {
    bonus++;
    delete lastKiller[killer.id];
    say('revenge');
  }
  if (lastKillAt[killer.id] !== undefined && s.tick - lastKillAt[killer.id] <= BOUNTY.doubleTicks) {
    bonus++;
    say('double');
  }
  lastKiller[victim.id] = killer.id;
  lastKillAt[killer.id] = s.tick;
  const n = (streaks[killer.id] = (streaks[killer.id] ?? 0) + 1);
  if (BOUNTY.streaks.includes(n)) s.events.push({ type: 'killStreak', playerId: killer.id, n });
  return bonus;
}

/** whoever falls starts their run of kills anew */
export function endStreak(s: SimState, victim: Player): void {
  if (s.versus?.streaks) delete s.versus.streaks[victim.id];
}

/** where Quad Damage shows up: the power-up spot nearest the middle of the map (the same one every time) */
function quadSpot(s: SimState): Vec2 | undefined {
  const mid = { x: s.map.w / 2, z: s.map.h / 2 };
  const spots = s.map.powerSpots.length > 0 ? s.map.powerSpots : s.map.crateSpots;
  return [...spots].sort((a, b) => dist(a, mid) - dist(b, mid))[0];
}

/** Every versus match: Quad Damage comes back at its spot, as long as none lies there. */
export function updateQuad(s: SimState): void {
  const v = s.versus;
  if (!v) return;
  v.nextQuadAt ??= s.tick + BOUNTY.quadFirstTicks;
  if (s.tick < v.nextQuadAt) return;
  v.nextQuadAt = s.tick + BOUNTY.quadEveryTicks;
  const at = quadSpot(s);
  if (!at || s.powerups.some(p => p.kind === 'quad') || !spotClear(s, at)) return;
  s.powerups.push({ id: s.nextId++, kind: 'quad', pos: { ...at }, expiresAt: s.tick + BOUNTY.quadLifeTicks });
  s.events.push({ type: 'powerupSpawned', kind: 'quad', pos: { ...at } });
}
