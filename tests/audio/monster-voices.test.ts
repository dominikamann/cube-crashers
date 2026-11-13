import { describe, expect, it } from 'vitest';
import { SOUNDS, soundsForEvent } from '../../src/audio/sfx';
import { soundDuration } from '../../src/audio/synth';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim, stepSim } from '../../src/sim/sim';
import { spawnBoss } from '../../src/sim/systems/boss';
import type { BossKind } from '../../src/sim/types';

const at = { x: 0, z: 0 };

describe('monster voices', () => {
  it('a T-Rex roars before it stomps: a long, deep sound', () => {
    const [s] = soundsForEvent({ type: 'enemyWindup', id: 1, kind: 'trex', pos: at, dir: at });
    expect(s.id).toBe('roar_rex');
    expect(soundDuration(SOUNDS.roar_rex)).toBeGreaterThan(0.9);
    expect(Math.max(...SOUNDS.roar_rex.map(l => l.freq))).toBeLessThan(600);
  });

  it('crocodiles growl and monkeys screech', () => {
    expect(soundsForEvent({ type: 'enemyWindup', id: 1, kind: 'croc', pos: at, dir: at })[0].id).toBe('growl_croc');
    expect(soundsForEvent({ type: 'enemyWindup', id: 1, kind: 'monkey', pos: at, dir: at })[0].id).toBe('screech_monkey');
  });

  it('every boss has a voice of its own, heard when it arrives and when it attacks', () => {
    const ids = new Set<string>();
    for (const kind of ['megaBlock', 'worm', 'rex', 'kraken', 'rhino'] as BossKind[]) {
      const attack = soundsForEvent({ type: 'bossAttack', kind });
      expect(attack).toHaveLength(1);
      expect(attack[0].id).toBe(`roar_${kind}`);
      ids.add(attack[0].id);
      expect(soundsForEvent({ type: 'bossSpawn', kind }).map(s => s.id)).toContain(`roar_${kind}`);
    }
    expect(ids.size).toBe(5);
  });

  it('a boss raises its voice with its big moves', () => {
    const s = createSim(FLOORS.arena.map, 2, { mode: 'quick', players: 1 });
    s.enemies = [];
    s.boss = null;
    spawnBoss(s, 'rhino');
    s.players[0].invulnUntil = 1e9;
    let heard = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepSim(s, []);
      heard += s.events.filter(e => e.type === 'bossAttack' && e.kind === 'rhino').length;
    }
    expect(heard).toBeGreaterThan(0);
  });
});
