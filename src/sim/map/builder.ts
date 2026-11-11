/**
 * Helpers to draw a floor as a character grid (see parseMap for the legend). Hand-placed layout,
 * with pads and rush entries placed automatically around the nest spots so every floor follows the
 * same rules: 3 pads close to each nest, 2 entries 10–13 tiles away that belong to that nest.
 */
export class GridBuilder {
  readonly grid: string[][];

  constructor(readonly w: number, readonly h: number) {
    this.grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
    this.fill(0, w - 1, 0, 0, '#');
    this.fill(0, w - 1, h - 1, h - 1, '#');
    this.fill(0, 0, 0, h - 1, '#');
    this.fill(w - 1, w - 1, 0, h - 1, '#');
  }

  /** fills the inclusive rectangle x0..x1, z0..z1 */
  fill(x0: number, x1: number, z0: number, z1: number, ch: string): this {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z][x] = ch;
    return this;
  }

  put(ch: string, ...points: [number, number][]): this {
    for (const [x, z] of points) this.grid[z][x] = ch;
    return this;
  }

  at(x: number, z: number): string {
    return x < 0 || z < 0 || x >= this.w || z >= this.h ? '#' : this.grid[z][x];
  }

  /** places 'p' pads and 'r' rush entries around every 'N' already in the grid */
  autoNestSurroundings(): this {
    const nests: [number, number][] = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) if (this.grid[z][x] === 'N') nests.push([x, z]);
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const nearest = (p: [number, number]) => nests.reduce((best, n) => (dist(p, n) < dist(p, best) ? n : best));
    const open = (x: number, z: number) => this.at(x, z) === '.';
    // an entry needs room around it for a horde to appear
    const roomy = (x: number, z: number) => [-1, 0, 1].every(ox => [-1, 0, 1].every(oz => this.at(x + ox, z + oz) !== '#'));
    for (const n of nests) {
      let pads = 0;
      for (const [ox, oz] of [[-5, 0], [5, 0], [0, 5], [0, -5], [-4, 4], [4, -4], [4, 4], [-4, -4]]) {
        if (pads >= 3) break;
        const x = n[0] + ox, z = n[1] + oz;
        if (open(x, z) && roomy(x, z)) {
          this.grid[z][x] = 'p';
          pads++;
        }
      }
      const candidates: [number, number][] = [];
      for (let z = 1; z < this.h - 1; z++) {
        for (let x = 1; x < this.w - 1; x++) {
          const d = dist([x, z], n);
          if (d < 10.5 || d > 13.5 || !open(x, z) || !roomy(x, z) || nearest([x, z]) !== n) continue;
          candidates.push([x, z]);
        }
      }
      // the two candidates furthest apart, so rushes come from different sides
      let best: [[number, number], [number, number]] | null = null;
      for (const a of candidates) for (const b of candidates) if (!best || dist(a, b) > dist(best[0], best[1])) best = [a, b];
      if (best) for (const [x, z] of best) this.grid[z][x] = 'r';
    }
    return this;
  }

  rows(): string[] {
    return this.grid.map(r => r.join(''));
  }
}
