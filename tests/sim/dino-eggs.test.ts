import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/sim/config/enemies';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';
import { EGGS } from '../../src/sim/systems/eggs';
import type { BossKind, SimState } from '../../src/sim/types';

function fight(kind: BossKind): SimState {
  const s = createSim(FLOORS.arena.map, 4, { mode: 'quick', players: 1 });
  s.enemies = [];
  s.nests = [];
  s.boss = null;
  s.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  spawnBoss(s, kind);
  s.players[0].invulnUntil = 1e9;
  return s;
}
function kill(s: SimState) {
  s.enemies.find(e => e.id === s.boss!.enemyId)!.hp = 0;
  stepSim(s, []);
}

describe('King Rex leaves eggs behind', () => {
  it('three eggs fly out of the explosion, around where it fell', () => {
    const s = fight('rex');
    const at = { ...s.enemies.find(e => e.id === s.boss!.enemyId)!.pos };
    kill(s);
    expect(s.boss).toBeNull();
    expect(s.eggs).toHaveLength(EGGS.count);
    for (const e of s.eggs!) expect(Math.hypot(e.pos.x - at.x, e.pos.z - at.z)).toBeLessThan(5);
    expect(s.enemies.filter(e => e.kind === 'trex')).toHaveLength(0);
  });

  it('baby dinos hatch from them: T-Rexes that stomp, smaller, faster and quick to beat', () => {
    const s = fight('rex');
    kill(s);
    let hatched = 0;
    for (let i = 0; i < EGGS.hatchTicks + 120; i++) {
      stepSim(s, []);
      hatched += s.events.filter(e => e.type === 'eggHatch').length;
    }
    expect(hatched).toBe(EGGS.count);
    expect(s.eggs).toHaveLength(0);
    const babies = s.enemies.filter(e => e.kind === 'trex');
    expect(babies).toHaveLength(EGGS.count);
    for (const b of babies) {
      expect(b.maxHp).toBeLessThan(ENEMIES.trex.hp * 0.3);
      expect(b.radius).toBeLessThan(ENEMIES.trex.radius);
      expect(b.speed).toBeGreaterThan(ENEMIES.trex.speed * 1.5);
    }
  });

  it('other bosses leave none', () => {
    const s = fight('megaBlock');
    kill(s);
    expect(s.eggs ?? []).toHaveLength(0);
  });
});
