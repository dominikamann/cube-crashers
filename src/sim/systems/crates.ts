import { MAX_WEAPON_LEVEL, MAX_WEAPONS } from '../config/weapons';
import type { Player, SimState, WeaponKind } from '../types';

export const FULL_ARSENAL_COINS = 25;

export function grantWeapon(_s: SimState, p: Player, kind: WeaponKind): void {
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
}

