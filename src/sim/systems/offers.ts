import { PLAYER_RADIUS } from '../config/balance';
import { ALL_PERKS, PERK_MAX } from '../config/perks';
import { ALL_WEAPONS, MAX_WEAPON_LEVEL, MAX_WEAPONS } from '../config/weapons';
import { BLOCKS_WALKER, isFree } from '../map/tilemap';
import type { Card, Crate, Player, SimState, Vec2, WeaponKind } from '../types';
import { dist } from '../util';

export const CRATE_PICKUP_RADIUS = 0.8;
export const CARD_PICKUP_RADIUS = 0.7;
export const CARD_DISTANCE = 1.8;
export const CARD_ARM_TICKS = 30;
export const OFFER_TICKS = 900;
export const EMPTY_CRATE_COINS = 25;
export const START_CRATES = 3;

/** Adds the weapon or raises its level. Returns the level it has afterwards. */
export function grantWeapon(p: Player, kind: WeaponKind): number {
  const held = p.weapons.find(w => w.kind === kind);
  if (held) {
    held.level = Math.min(MAX_WEAPON_LEVEL, held.level + 1);
    return held.level;
  }
  if (p.weapons.length < MAX_WEAPONS) p.weapons.push({ kind, level: 1, cooldown: 0 });
  return 1;
}

function options(p: Player): Card[] {
  const cards: Card[] = [];
  for (const kind of ALL_WEAPONS) {
    const held = p.weapons.find(w => w.kind === kind);
    if (held ? held.level < MAX_WEAPON_LEVEL : p.weapons.length < MAX_WEAPONS) cards.push({ type: 'weapon', weapon: kind });
  }
  for (const perk of ALL_PERKS) {
    if (p.perks[perk] < PERK_MAX[perk]) cards.push({ type: 'perk', perk });
  }
  return cards;
}

/** Three spots around the crate, far enough that the opener does not touch one by accident. */
function cardPositions(s: SimState, pos: Vec2, n: number): Vec2[] {
  for (const turn of [0, Math.PI / 3]) {
    const spots = Array.from({ length: n }, (_, i) => {
      const a = turn - Math.PI / 2 + (i * 2 * Math.PI) / 3;
      return { x: pos.x + Math.cos(a) * CARD_DISTANCE, z: pos.z + Math.sin(a) * CARD_DISTANCE };
    });
    if (spots.every(c => isFree(s.map, c, PLAYER_RADIUS, BLOCKS_WALKER))) return spots;
  }
  // cramped corner: put the cards in a short row on the crate itself
  return Array.from({ length: n }, (_, i) => ({ x: pos.x, z: pos.z + (i - 1) * 0.1 }));
}

function openCrate(s: SimState, crate: Crate, p: Player): void {
  const pool = options(p);
  if (pool.length === 0) {
    p.coins += EMPTY_CRATE_COINS;
    s.events.push({ type: 'crateCoins', playerId: p.id, coins: EMPTY_CRATE_COINS });
    return;
  }
  const cards: Card[] = [];
  while (cards.length < 3 && pool.length > 0) cards.push(...pool.splice(Math.floor(s.rng.next() * pool.length), 1));
  s.offers.push({
    id: s.nextId++,
    pos: { ...crate.pos },
    cards,
    cardPos: cardPositions(s, crate.pos, cards.length),
    armedAt: s.tick + CARD_ARM_TICKS,
    expiresAt: s.tick + OFFER_TICKS,
  });
  s.events.push({ type: 'offerOpened', pos: { ...crate.pos } });
}

function take(s: SimState, p: Player, card: Card): void {
  let level: number;
  if (card.type === 'weapon') {
    level = grantWeapon(p, card.weapon);
  } else {
    level = ++p.perks[card.perk];
    if (card.perk === 'dash') p.dashCharges++;
  }
  s.events.push({ type: 'cardPicked', playerId: p.id, card, level });
}

export function placeStartCrates(s: SimState): void {
  const spots = [...s.map.crateSpots];
  for (let i = 0; i < START_CRATES && spots.length > 0; i++) {
    const [pos] = spots.splice(Math.floor(s.rng.next() * spots.length), 1);
    s.crates.push({ id: s.nextId++, pos: { ...pos } });
  }
}

export function updateOffers(s: SimState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  s.crates = s.crates.filter(c => {
    const opener = alive.find(p => dist(p.pos, c.pos) <= CRATE_PICKUP_RADIUS);
    if (!opener) return true;
    openCrate(s, c, opener);
    return false;
  });
  s.offers = s.offers.filter(o => {
    if (s.tick >= o.expiresAt) return false;
    if (s.tick < o.armedAt) return true;
    for (const p of alive) {
      const i = o.cardPos.findIndex(c => dist(c, p.pos) <= CARD_PICKUP_RADIUS);
      if (i < 0) continue;
      take(s, p, o.cards[i]);
      return false;
    }
    return true;
  });
}
