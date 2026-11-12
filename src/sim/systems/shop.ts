import { syncCredits } from './coop';
import { ALL_PERKS, PERK_MAX } from '../config/perks';
import { MAX_WEAPON_LEVEL } from '../config/weapons';
import type { Player, ShopOffer, SimState } from '../types';

export const SHOP = {
  /** 25 seconds */
  ticks: 1500,
  offers: 4,
  weaponCost: 60,
  perkCost: 80,
  healCost: 40,
  creditCost: 150,
};

function offersFor(s: SimState, p: Player): ShopOffer[] {
  const out: ShopOffer[] = [];
  const upgradable = p.weapons.filter(w => w.level < MAX_WEAPON_LEVEL);
  if (upgradable.length > 0) out.push({ kind: 'weapon', weapon: s.rng.pick(upgradable).kind, cost: SHOP.weaponCost, sold: false });
  const perks = ALL_PERKS.filter(k => p.perks[k] < PERK_MAX[k]);
  if (perks.length > 0) out.push({ kind: 'perk', perk: s.rng.pick(perks), cost: SHOP.perkCost, sold: false });
  out.push({ kind: 'heal', cost: SHOP.healCost, sold: false });
  out.push({ kind: 'credit', cost: SHOP.creditCost, sold: false });
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
      syncCredits(s);
      shop.creditSold = true;
      break;
  }
  s.events.push({ type: 'bought', playerId: p.id, offer: index, kind: offer.kind });
}

/** true when the shop is over (everyone ready, or the time is up) */
export function shopDone(s: SimState): boolean {
  const shop = s.run.shop!;
  return s.tick >= s.run.stageUntil || s.players.every(p => shop.ready.includes(p.id));
}
