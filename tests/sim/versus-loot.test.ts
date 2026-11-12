import { describe, expect, it } from 'vitest';
import { floorNeon } from '../../src/sim/config/floor-neon';
import { createSim } from '../../src/sim/sim';
import { damagePlayer } from '../../src/sim/systems/player';
import { dist } from '../../src/sim/util';

const match = (rule: 'score' | 'gungame') => createSim(floorNeon, 3, { mode: 'versus', players: 2, versus: { mode: 'ffa', rule } });

describe('what a fallen player leaves behind in versus', () => {
  it('their extra weapons lie where they fell, to be picked up, and their jetpack too', () => {
    const s = match('score');
    const [killer, victim] = s.players;
    victim.invulnUntil = 0;
    victim.weapons.push({ kind: 'candyCannon', level: 2, cooldown: 0 }, { kind: 'bomb', level: 1, cooldown: 0 });
    victim.jetpack = true;
    const at = { ...victim.pos };
    const jetpacks = s.jetpacks.length;
    damagePlayer(s, victim, 1000, 'shot', killer.id);
    const loot = s.offers.find(o => dist(o.pos, at) < 1.5);
    expect(loot?.cards).toEqual([{ type: 'weapon', weapon: 'candyCannon' }, { type: 'weapon', weapon: 'bomb' }]);
    expect(s.jetpacks).toHaveLength(jetpacks + 1);
    expect(victim.weapons.map(w => w.kind)).toEqual(['pixelBlaster']);
  });

  it('with only the blaster nothing is left', () => {
    const s = match('score');
    const [killer, victim] = s.players;
    victim.invulnUntil = 0;
    damagePlayer(s, victim, 1000, 'shot', killer.id);
    expect(s.offers).toHaveLength(0);
  });

  it('gun game: no weapons to pick up (the ladder decides), a few coins instead', () => {
    const s = match('gungame');
    const [killer, victim] = s.players;
    victim.invulnUntil = 0;
    damagePlayer(s, victim, 1000, 'shot', killer.id);
    expect(s.offers).toHaveLength(0);
    expect(s.coins.length).toBeGreaterThan(0);
  });
});
