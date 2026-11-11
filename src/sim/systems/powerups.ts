import type { PowerupKind, Player, SimState } from '../types';
import { dist } from '../util';
import { explode } from './combat';

export const POWERUP = {
  firstTicks: 600,
  intervalTicks: 1800,
  lifetimeTicks: 900,
  pickupRadius: 0.9,
  magnetTicks: 480,
  rapidTicks: 480,
  bombRadius: 8,
  bombDamage: 250,
  frostTicks: 300,
  heart: 50,
};

const KINDS: PowerupKind[] = ['magnet', 'rapid', 'bomb', 'frost', 'heart'];

function apply(s: SimState, p: Player, kind: PowerupKind): void {
  switch (kind) {
    case 'magnet':
      p.magnetUntil = s.tick + POWERUP.magnetTicks;
      break;
    case 'rapid':
      p.rapidUntil = s.tick + POWERUP.rapidTicks;
      break;
    case 'bomb':
      explode(s, p.pos, POWERUP.bombRadius, { enemy: POWERUP.bombDamage }, 'bomb', p.id);
      break;
    case 'frost':
      for (const e of s.enemies) e.slowUntil = s.tick + POWERUP.frostTicks;
      break;
    case 'heart':
      p.hp = Math.min(p.maxHp, p.hp + POWERUP.heart);
      break;
  }
}

export function updatePowerups(s: SimState): void {
  if (s.tick >= s.nextPowerupAt) {
    s.nextPowerupAt = s.tick + POWERUP.intervalTicks;
    const free = s.map.powerSpots.filter(sp => !s.powerups.some(pu => pu.pos.x === sp.x && pu.pos.z === sp.z));
    if (free.length > 0) {
      const pu = { id: s.nextId++, kind: s.rng.pick(KINDS), pos: { ...s.rng.pick(free) }, expiresAt: s.tick + POWERUP.lifetimeTicks };
      s.powerups.push(pu);
      s.events.push({ type: 'powerupSpawned', kind: pu.kind, pos: { ...pu.pos } });
    }
  }
  const alive = s.players.filter(p => p.downUntil === null);
  s.powerups = s.powerups.filter(pu => {
    if (s.tick >= pu.expiresAt) return false;
    const p = alive.find(x => dist(x.pos, pu.pos) <= POWERUP.pickupRadius);
    if (!p) return true;
    apply(s, p, pu.kind);
    s.events.push({ type: 'powerupPicked', kind: pu.kind, playerId: p.id });
    return false;
  });
}
