import { describe, it } from 'vitest';
import { ALL_WEAPONS, BOSSES, DIFFICULTIES, LEVELS, bossHealth, botFight, botRun, weaponDps } from './measure';

const pad = (v: string | number, n = 8) => String(typeof v === 'number' ? Math.round(v) : v).padStart(n);

/** Prints the balance tables. Not part of the test run: `BALANCE_REPORT=1 vitest run tests/balance/report.test.ts`. */
describe.skipIf(!process.env.BALANCE_REPORT)('balance report', () => {
  it('weapons, bosses and the time a boss lives', () => {
    const out: string[] = ['', 'damage per second on a boss, by weapon level'];
    out.push(pad('', 20) + LEVELS.map(l => pad(`L${l}`)).join(''));
    const dps: Record<string, number[]> = {};
    for (const w of ALL_WEAPONS) {
      dps[w] = LEVELS.map(l => weaponDps(w, l));
      out.push(pad(w, 20) + dps[w].map(v => pad(v)).join(''));
    }
    out.push('', 'boss health, solo (weapons at L1 / L3 / L5)');
    out.push(pad('', 20) + DIFFICULTIES.map(d => pad(d, 20)).join(''));
    const row = (name: string, f: (d: (typeof DIFFICULTIES)[number], l: number) => number) => out.push(pad(name, 20) + DIFFICULTIES.map(d => pad([1, 3, 5].map(l => Math.round(f(d, l))).join('/'), 20)).join(''));
    for (const b of BOSSES) row(b, (d, l) => bossHealth(b, { difficulty: d, level: l }));
    row('worm (final)', (d, l) => bossHealth('worm', { difficulty: d, level: l, final: true }));
    row('rhino (wild)', (d, l) => bossHealth('rhino', { difficulty: d, level: l, wild: true }));
    row('megaBlock x4', (d, l) => bossHealth('megaBlock', { difficulty: d, level: l, players: 4 }));
    out.push('', 'seconds a boss lives against the Pixel Blaster that never misses (L1 / L3 / L5)');
    const blaster = dps.pixelBlaster;
    for (const b of BOSSES) row(b, (d, l) => bossHealth(b, { difficulty: d, level: l }) / blaster[l - 1]);
    row('worm (final)', (d, l) => bossHealth('worm', { difficulty: d, level: l, final: true }) / blaster[l - 1]);
    row('rhino (wild)', (d, l) => bossHealth('rhino', { difficulty: d, level: l, wild: true }) / blaster[l - 1]);
    console.log(out.join('\n'));
  }, 600_000);

  it('the scripted player against the bosses', () => {
    const out: string[] = ['', 'scripted player with the Pixel Blaster: seconds until the boss is down (x = lost)'];
    const cell = (f: { won: boolean; seconds: number }) => `${Math.round(f.seconds)}${f.won ? '' : 'x'}`;
    const fights = [
      ['megaBlock', 'arena', false, undefined],
      ['rhino', 'arena', false, 'rhino'],
      ['kraken', 'underwater', false, undefined],
      ['worm (final)', 'rooftop', true, undefined],
      ['rex (final)', 'rooftop', true, 'rex'],
      ['spider (final)', 'rooftop', true, 'spider'],
      ['witch (town)', 'waldsee', false, undefined],
    ] as const;
    for (const [name, floor, final, boss] of fights) {
      for (const d of ['ultraLow', 'medium', 'ultraHigh'] as const) out.push(pad(name, 16) + pad(d, 11) + [1, 3, 5].map(l => pad(cell(botFight(floor, 'pixelBlaster', l, d, 3, final, boss)))).join(''));
    }
    console.log(out.join('\n'));
  }, 900_000);

  it('a run by the scripted player', () => {
    const out: string[] = [''];
    const seeds = (process.env.BALANCE_SEEDS ?? '1,2').split(',').map(Number);
    for (const d of (process.env.BALANCE_DIFFICULTIES?.split(',') ?? ['ultraLow', 'medium']) as (typeof DIFFICULTIES)[number][]) {
      for (const seed of seeds) {
        const r = botRun(d, seed);
        out.push(`${d} seed ${seed}: ${r.result}, coins collected ${r.coins}, lives ${r.lives}`);
        out.push(['floor', 'map', 'sec', 'earned', 'atShop', 'shopAll', 'life', 'crates', 'best', 'levels', 'downs', 'boss s'].map(h => pad(h, 9)).join(''));
        for (const f of r.floors) out.push([f.floor, f.map, f.seconds, f.earned, f.atShop, f.shopTotal, f.lifePrice, f.cratesOpened, f.bestLevel, f.levels, f.downs, f.bossSeconds ?? '-'].map(v => pad(v, 9)).join(''));
      }
    }
    console.log(out.join('\n'));
  }, 1_800_000);
});
