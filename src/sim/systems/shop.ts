import { backIn } from './coop';
import { DIFFICULTY } from '../config/difficulty';
import { ALL_PERKS, PERK_MAX } from '../config/perks';
import { MAX_WEAPON_LEVEL } from '../config/weapons';
import type { Player, ShopOffer, SimState } from '../types';

export const SHOP = {
  /** 25 seconds */
  ticks: 1500,
  offers: 4,
  /**
   * Tower Run: what an offer costs in the first shop on Ultra Low. Every shop after it asks `perFloor` more of
   * that, so the coins of the higher floors are worth a decision too, the harder levels ask more for
   * everything (DifficultyDef.prices), and so does every purchase (`perPurchase`).
   */
  perFloor: 0.75,
  /** a weapon level: dearer the higher the level it buys */
  weaponCost: 100,
  weaponPerLevel: 50,
  /** a perk: dearer for every one of its kind the player has */
  perkCost: 120,
  perkPerOwned: 60,
  healCost: 60,
  /** a life for everyone: the dearest thing in the shop, dearer for every one the team bought before and for every extra player */
  creditCost: 400,
  creditPerBought: 0.5,
  creditPerPlayer: 0.25,
  /** whoever buys a lot pays more: everything is this much dearer for a player for each thing they bought before */
  perPurchase: 0.15,
  /** Boss Rush: there is little to earn between two bosses, so its shop keeps flat, low prices */
  rush: { weaponCost: 60, perkCost: 80, healCost: 40, creditCost: 150 },
};

/** prices are round numbers */
const price = (n: number) => Math.round(n / 5) * 5;

/**
 * How much dearer the shop after floor `floor` (0 = the first) is than the first one. `rate` is everything else
 * that makes it dearer: the difficulty's share and what the buyer has bought before (see shopRate).
 */
export const floorFactor = (floor: number, rate = 1) => (1 + SHOP.perFloor * floor) * rate;

/** what the next level of a weapon at `level` costs in the shop after floor `floor` of a Tower Run */
export const weaponPrice = (level: number, floor: number, rate = 1) => price((SHOP.weaponCost + SHOP.weaponPerLevel * level) * floorFactor(floor, rate));

/** what one more of a perk the player has `owned` of costs */
export const perkPrice = (owned: number, floor: number, rate = 1) => price((SHOP.perkCost + SHOP.perkPerOwned * owned) * floorFactor(floor, rate));

export const healPrice = (floor: number, rate = 1) => price(SHOP.healCost * floorFactor(floor, rate));

/** what a life for everyone costs a team of `players` that bought `bought` of them before */
export const creditPrice = (bought: number, floor: number, players: number, rate = 1) =>
  price(SHOP.creditCost * floorFactor(floor, rate) * (1 + SHOP.creditPerBought * bought) * (1 + SHOP.creditPerPlayer * Math.max(0, players - 1)));

/** the difficulty's share of the prices, and `perPurchase` more for everything this player has bought in the run's shops */
export const shopRate = (s: SimState, p: Player) => DIFFICULTY[s.difficulty].prices * (1 + SHOP.perPurchase * (p.bought ?? 0));

/** What an offer costs this player right now. */
function costOf(s: SimState, p: Player, o: ShopOffer): number {
  if (s.run.mode === 'bossrush') return SHOP.rush[`${o.kind}Cost`];
  const floor = s.run.floor, rate = shopRate(s, p);
  switch (o.kind) {
    case 'weapon':
      return weaponPrice(p.weapons.find(w => w.kind === o.weapon)?.level ?? 1, floor, rate);
    case 'perk':
      return perkPrice(p.perks[o.perk!], floor, rate);
    case 'heal':
      return healPrice(floor, rate);
    case 'credit':
      return creditPrice(s.run.creditsBought ?? 0, floor, s.players.length, rate);
  }
}

function offersFor(s: SimState, p: Player): ShopOffer[] {
  const out: ShopOffer[] = [];
  const upgradable = p.weapons.filter(w => w.level < MAX_WEAPON_LEVEL);
  if (upgradable.length > 0) out.push({ kind: 'weapon', weapon: s.rng.pick(upgradable).kind, cost: 0, sold: false });
  const perks = ALL_PERKS.filter(k => p.perks[k] < PERK_MAX[k]);
  if (perks.length > 0) out.push({ kind: 'perk', perk: s.rng.pick(perks), cost: 0, sold: false });
  out.push({ kind: 'heal', cost: 0, sold: false });
  out.push({ kind: 'credit', cost: 0, sold: false });
  for (const o of out) o.cost = costOf(s, p, o);
  return out.slice(0, SHOP.offers);
}

export function openShop(s: SimState): void {
  s.run.stage = 'shop';
  s.run.stageUntil = s.tick + SHOP.ticks;
  const offers: Record<number, ShopOffer[]> = {};
  for (const p of s.players) offers[p.id] = offersFor(s, p);
  s.run.shop = { offers, ready: [], creditSold: false };
}

export function buy(s: SimState, p: Player, index: number): void {
  const shop = s.run.shop;
  const offer = shop?.offers[p.id]?.[index];
  const deny = () => void s.events.push({ type: 'buyDenied', playerId: p.id, offer: index });
  if (!shop || !offer || offer.sold || p.coins < offer.cost || (offer.kind === 'credit' && shop.creditSold)) return deny();
  p.coins -= offer.cost;
  offer.sold = true;
  switch (offer.kind) {
    case 'weapon': {
      const w = p.weapons.find(x => x.kind === offer.weapon);
      if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
      break;
    }
    case 'perk':
      p.perks[offer.perk!]++;
      if (offer.perk === 'dash') p.dashCharges++;
      break;
    case 'heal':
      p.hp = p.maxHp;
      break;
    case 'credit':
      // a life for everyone in the team
      for (const q of s.players) q.lives = (q.lives ?? 0) + 1;
      // and whoever was out is back in
      backIn(s);
      shop.creditSold = true;
      s.run.creditsBought = (s.run.creditsBought ?? 0) + 1;
      break;
  }
  // every purchase makes what is left dearer for the buyer, in this shop and the ones to come
  p.bought = (p.bought ?? 0) + 1;
  for (const o of shop.offers[p.id]) if (!o.sold) o.cost = costOf(s, p, o);
  s.events.push({ type: 'bought', playerId: p.id, offer: index, kind: offer.kind });
}

/** true when the shop is over (everyone ready, or the time is up) */
export function shopDone(s: SimState): boolean {
  const shop = s.run.shop!;
  return s.tick >= s.run.stageUntil || s.players.every(p => shop.ready.includes(p.id));
}
