import { MAX_WEAPON_LEVEL, MAX_WEAPONS } from '../config/weapons';
import { DT, type Player, type SimState, type Vec2, type WeaponKind } from '../types';
import { dist } from '../util';

export const CRATE_SPEED = 1.8;
export const CRATE_HP = 8;
export const CRATE_PICKUP_RADIUS = 0.8;
export const FULL_ARSENAL_COINS = 25;

const CRATE_WEAPONS: WeaponKind[] = ['laserSword', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'discoBall'];

export function spawnCrate(s: SimState, pos: Vec2): void {
  // prefer weapons the (first) player can still gain from
  const p = s.players[0];
  const useful = CRATE_WEAPONS.filter(k => (p.weapons.find(w => w.kind === k)?.level ?? 0) < MAX_WEAPON_LEVEL);
  const weapon = s.rng.pick(useful.length > 0 ? useful : CRATE_WEAPONS);
  s.crates.push({ id: s.nextId++, pos: { ...pos }, weapon, hp: CRATE_HP });
}

export function grantWeapon(s: SimState, p: Player, kind: WeaponKind): void {
  const held = p.weapons.find(w => w.kind === kind);
  let granted = held;
  if (held && held.level < MAX_WEAPON_LEVEL) {
    held.level++;
  } else if (!held && p.weapons.length < MAX_WEAPONS) {
    granted = { kind, level: 1, cooldown: 0 };
    p.weapons.push(granted);
  } else {
    const upgradable = p.weapons.filter(w => w.level < MAX_WEAPON_LEVEL);
    if (upgradable.length === 0) {
      p.coins += FULL_ARSENAL_COINS;
      granted = undefined;
    } else {
      granted = upgradable.reduce((a, b) => (b.level < a.level ? b : a));
      granted.level++;
    }
  }
  s.events.push({
    type: 'crateOpened',
    playerId: p.id,
    weapon: granted?.kind ?? kind,
    level: granted?.level ?? MAX_WEAPON_LEVEL,
  });
}

export function updateCrates(s: SimState): void {
  const alive = s.players.filter(p => p.downUntil === null);
  s.crates = s.crates.filter(c => {
    c.pos.z += CRATE_SPEED * DT;
    if (c.pos.z >= s.map.baseZ) return false;
    let opener: Player | undefined = alive.find(p => dist(p.pos, c.pos) <= CRATE_PICKUP_RADIUS);
    if (!opener && c.hp <= 0) {
      opener = alive.reduce<Player | undefined>(
        (best, p) => (!best || dist(p.pos, c.pos) < dist(best.pos, c.pos) ? p : best),
        undefined,
      );
    }
    if (!opener) return true;
    grantWeapon(s, opener, c.weapon);
    return false;
  });
}
