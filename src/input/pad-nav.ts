/**
 * Moving through a menu with the d-pad or stick: each direction goes to the nearest button that lies that way
 * on screen, so rows, grids and single buttons all behave the way they look.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Direction = 'up' | 'down' | 'left' | 'right';

/** the index of the button to go to from `from` (-1: nothing chosen yet, which picks the first); `from` at an edge */
export function nextInDirection(boxes: readonly Box[], from: number, dir: Direction): number {
  if (boxes.length === 0) return -1;
  if (from < 0 || from >= boxes.length) return 0;
  const a = boxes[from];
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best = from;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    // how far it lies ahead (edge to edge), and how far off to the side (0 while they overlap)
    const ahead = vertical ? (sign > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h)) : sign > 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
    if (ahead < -2) return;
    const side = vertical ? Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)) : Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
    const centre = vertical ? Math.abs(b.x + b.w / 2 - ax) : Math.abs(b.y + b.h / 2 - ay);
    // straight ahead wins over something closer but off to the side
    const score = Math.max(0, ahead) + side * 3 + centre * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
