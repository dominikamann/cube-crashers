import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/sim/config/enemies';
import { WEAPONS } from '../../src/sim/config/weapons';
import { applySnapshot, serializeSnapshot } from '../../src/net/snapshot';
import { stepSim } from '../../src/sim/sim';
import { damageInRadius } from '../../src/sim/systems/combat';
import { spawnEnemy } from '../../src/sim/systems/enemies';
import { HORDE_COMPS } from '../../src/sim/systems/hordes';
import { laneWave } from '../../src/sim/systems/lane';
import type { EnemyKind, HeldWeapon } from '../../src/sim/types';
import { aimAt, fire, quietSim, rel, run } from './helpers';

const shooter = (kind: HeldWeapon['kind'] = 'pixelRail'): HeldWeapon[] => [{ kind, level: 1, cooldown: 0 }];

describe('the Shielder', () => {
  it('shrugs off shots from the front, takes them in full from behind', () => {
    const s = quietSim();
    const p = s.players[0];
    p.weapons = shooter();
    const front = spawnEnemy(s, 'shielder', rel(p.pos, 0, -4));
    // stuck in place, so it cannot turn round
    front.stuckUntil = 1e9;
    front.dir = { x: 0, z: 1 };
    stepSim(s, [aimAt(front.pos), fire]);
    const full = WEAPONS.pixelRail.damage;
    expect(ENEMIES.shielder.hp - front.hp).toBeCloseTo(full * 0.2);

    const s2 = quietSim();
    const p2 = s2.players[0];
    p2.weapons = shooter();
    const back = spawnEnemy(s2, 'shielder', rel(p2.pos, 0, -4));
    back.stuckUntil = 1e9;
    back.dir = { x: 0, z: -1 };
    stepSim(s2, [aimAt(back.pos), fire]);
    expect(ENEMIES.shielder.hp - back.hp).toBeCloseTo(full);
  });

  it('a blast from above gets round the shield', () => {
    const s = quietSim();
    const e = spawnEnemy(s, 'shielder', rel(s.players[0].pos, 0, -4));
    damageInRadius(s, e.pos, 2, 10, 'bomb', 0);
    expect(ENEMIES.shielder.hp - e.hp).toBe(10);
  });
});

describe('the Healer', () => {
  it('heals hurt monsters around it, again and again, but not past full', () => {
    const s = quietSim();
    const p = s.players[0];
    p.pos = rel(p.pos, 0, 6);
    const healer = spawnEnemy(s, 'healer', rel(p.pos, 0, -12));
    const tank = spawnEnemy(s, 'tank', rel(healer.pos, 1.5, 0));
    const far = spawnEnemy(s, 'tank', rel(healer.pos, 8, 0));
    for (const e of [healer, tank, far]) e.speed = 0;
    tank.hp = 20;
    far.hp = 20;
    run(s, 130);
    expect(tank.hp).toBeGreaterThan(40);
    expect(far.hp).toBe(20);
    run(s, 60 * 20);
    expect(tank.hp).toBe(tank.maxHp);
  });
});

describe('the Teleporter', () => {
  it('shimmers, then blinks right next to a player it can see', () => {
    const s = quietSim();
    const p = s.players[0];
    const e = spawnEnemy(s, 'teleporter', rel(p.pos, 0, -7));
    let blinked = false, warned = false;
    for (let i = 0; i < 180 && !blinked; i++) {
      stepSim(s, []);
      warned ||= s.events.some(ev => ev.type === 'enemyWindup' && ev.id === e.id);
      blinked = s.events.some(ev => ev.type === 'enemyBlink');
    }
    expect(warned).toBe(true);
    expect(blinked).toBe(true);
    expect(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)).toBeLessThan(2.5);
  });
});

describe('the new monsters show up', () => {
  it('in roaming hordes', () => {
    const kinds = new Set(Object.values(HORDE_COMPS).flat().map(g => g.kind));
    for (const k of ['shielder', 'healer', 'teleporter'] as EnemyKind[]) expect(kinds.has(k)).toBe(true);
  });

  it('in the Lane Defense waves', () => {
    const kinds = new Set(Array.from({ length: 20 }, (_, n) => laneWave(n)).flat());
    for (const k of ['shielder', 'healer', 'teleporter'] as EnemyKind[]) expect(kinds.has(k)).toBe(true);
  });

  it('on a LAN client too (and the maze ghosts as well)', () => {
    const s = quietSim();
    const kinds: EnemyKind[] = ['shielder', 'healer', 'teleporter', 'ghost'];
    for (const [i, k] of kinds.entries()) spawnEnemy(s, k, rel(s.players[0].pos, i, -5));
    const client = quietSim();
    const snap = JSON.parse(serializeSnapshot(s, []));
    applySnapshot(client, snap.state);
    expect(client.enemies.map(e => e.kind)).toEqual(kinds);
  });
});
