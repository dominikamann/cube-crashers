import { describe, expect, it } from 'vitest';
import { floor01 } from '../../src/sim/config/floor01';
import { ALL_WEAPONS } from '../../src/sim/config/weapons';
import { createSim, stepSim } from '../../src/sim/sim';
import { grantWeapon } from '../../src/sim/systems/offers';
import { BLOCKS_WALKER, isFree } from '../../src/sim/map/tilemap';
import type { Card, SimState } from '../../src/sim/types';
import { move, quietSim, rel, run } from './helpers';

const cardKey = (c: Card) => (c.type === 'weapon' ? `w:${c.weapon}` : `p:${c.perk}`);

function withCrate(): SimState {
  const s = quietSim();
  s.crates.push({ id: s.nextId++, pos: rel(s.players[0].pos, 0.3, 0) });
  return s;
}

function withOffer(cards: Card[]): SimState {
  const s = quietSim();
  const p = s.players[0].pos;
  s.offers.push({ id: s.nextId++, pos: rel(p, 0, -3), cards, cardPos: [rel(p, -2, -3), rel(p, 0, -3), rel(p, 2, -3)], armedAt: 0, expiresAt: 900 });
  return s;
}

describe('crates', () => {
  it('open into three different cards placed around the crate', () => {
    const s = withCrate();
    stepSim(s, []);
    expect(s.crates).toHaveLength(0);
    expect(s.offers).toHaveLength(1);
    const offer = s.offers[0];
    expect(offer.cards).toHaveLength(3);
    expect(new Set(offer.cards.map(cardKey)).size).toBe(3);
    expect(s.events.some(e => e.type === 'offerOpened')).toBe(true);
    for (const c of offer.cardPos) expect(Math.hypot(c.x - offer.pos.x, c.z - offer.pos.z)).toBeGreaterThan(1.2);
  });

  it('spread the cards apart even in a corner', () => {
    const s = quietSim();
    s.players[0].pos = { x: 2.5, z: 3.1 };
    s.crates.push({ id: s.nextId++, pos: { x: 2.5, z: 2.5 } });
    stepSim(s, []);
    const cp = s.offers[0].cardPos;
    for (let i = 0; i < cp.length; i++) {
      expect(isFree(s.map, cp[i], 0.4, BLOCKS_WALKER), `card ${i}`).toBe(true);
      for (let j = i + 1; j < cp.length; j++) expect(Math.hypot(cp[i].x - cp[j].x, cp[i].z - cp[j].z)).toBeGreaterThanOrEqual(1.4);
    }
  });

  it('do not hand out a card to a player who just stands there', () => {
    const s = withCrate();
    run(s, 200);
    expect(s.offers).toHaveLength(1);
  });

  it('pay 25 coins when there is nothing left to offer', () => {
    const s = withCrate();
    const p = s.players[0];
    p.weapons = ALL_WEAPONS.slice(0, 6).map(kind => ({ kind, level: 5, cooldown: 0 }));
    p.perks = { speed: 3, dash: 2, magnet: 3, greed: 3, regen: 3, stomp: 3 };
    stepSim(s, []);
    expect(s.offers).toHaveLength(0);
    expect(p.coins).toBe(25);
    expect(s.events).toContainEqual({ type: 'crateCoins', playerId: 0, coins: 25 });
  });

  it('only offer level-ups of held weapons when all 6 slots are full', () => {
    const s = withCrate();
    const p = s.players[0];
    p.weapons = ALL_WEAPONS.slice(0, 6).map(kind => ({ kind, level: 1, cooldown: 0 }));
    p.perks = { speed: 3, dash: 2, magnet: 3, greed: 3, regen: 3, stomp: 3 };
    stepSim(s, []);
    for (const c of s.offers[0].cards) {
      expect(c.type).toBe('weapon');
      if (c.type === 'weapon') expect(p.weapons.some(w => w.kind === c.weapon)).toBe(true);
    }
  });

  it('are placed on three crate spots at the start of a floor', () => {
    const s = createSim(floor01, 4);
    expect(s.crates).toHaveLength(3);
    for (const c of s.crates) expect(s.map.crateSpots.some(sp => sp.x === c.pos.x && sp.z === c.pos.z)).toBe(true);
  });
});

describe('cards', () => {
  it('cannot be taken in the first half second', () => {
    const s = withOffer([{ type: 'perk', perk: 'speed' }, { type: 'perk', perk: 'regen' }, { type: 'perk', perk: 'greed' }]);
    s.offers[0].armedAt = s.tick + 30;
    s.players[0].pos = { ...s.offers[0].cardPos[0] };
    run(s, 29);
    expect(s.offers).toHaveLength(1);
    run(s, 2);
    expect(s.offers).toHaveLength(0);
    expect(s.players[0].perks.speed).toBe(1);
  });

  it('give a new weapon and remove the other cards', () => {
    const s = withOffer([{ type: 'perk', perk: 'speed' }, { type: 'weapon', weapon: 'candyCannon' }, { type: 'perk', perk: 'regen' }]);
    const events = run(s, 40, () => [move(0, -1)]);
    const p = s.players[0];
    expect(p.weapons.map(w => [w.kind, w.level])).toEqual([['pixelBlaster', 1], ['candyCannon', 1]]);
    expect(s.offers).toHaveLength(0);
    expect(p.perks.speed + p.perks.regen).toBe(0);
    expect(events).toContainEqual({ type: 'cardPicked', playerId: 0, card: { type: 'weapon', weapon: 'candyCannon' }, level: 1 });
  });

  it('level up a weapon the player already has', () => {
    const s = withOffer([{ type: 'perk', perk: 'speed' }, { type: 'weapon', weapon: 'pixelBlaster' }, { type: 'perk', perk: 'regen' }]);
    run(s, 40, () => [move(0, -1)]);
    expect(s.players[0].weapons[0].level).toBe(2);
  });

  it('dash perk adds a charge right away', () => {
    const s = withOffer([{ type: 'perk', perk: 'speed' }, { type: 'perk', perk: 'dash' }, { type: 'perk', perk: 'regen' }]);
    run(s, 40, () => [move(0, -1)]);
    expect(s.players[0].perks.dash).toBe(1);
    expect(s.players[0].dashCharges).toBe(2);
  });

  it('disappear after 15 seconds', () => {
    const s = withOffer([{ type: 'perk', perk: 'speed' }, { type: 'perk', perk: 'dash' }, { type: 'perk', perk: 'regen' }]);
    run(s, 899);
    expect(s.offers).toHaveLength(1);
    run(s, 2);
    expect(s.offers).toHaveLength(0);
  });
});

describe('grantWeapon', () => {
  it('adds at level 1, then levels up to at most 5', () => {
    const p = quietSim().players[0];
    expect(grantWeapon(p, 'bomb')).toBe(1);
    expect(grantWeapon(p, 'bomb')).toBe(2);
    p.weapons[1].level = 5;
    expect(grantWeapon(p, 'bomb')).toBe(5);
    expect(p.weapons).toHaveLength(2);
  });
});
