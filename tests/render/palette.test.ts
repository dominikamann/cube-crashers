import { afterEach, describe, expect, it } from 'vitest';
import { COLOR_BLIND, contrast, hueDistance, luminance, NORMAL, palette, playerColor, setColorBlind } from '../../src/render/palette';

/** how a colour looks with deuteranopia (Viénot, Brettel & Mollon 1999, in linear RGB) */
function deutan(c: number): number {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const enc = (v: number) => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
  const r = lin((c >> 16) & 255), g = lin((c >> 8) & 255), b = lin(c & 255);
  const rg = 0.29275 * r + 0.70725 * g;
  return (enc(rg) << 16) | (enc(rg) << 8) | enc(-0.02234 * r + 0.02234 * g + b);
}
const dist = (a: number, b: number) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));

/** colours that red-green colour blindness mixes up keep apart by hue or brightness */
const apart = (a: number, b: number) => hueDistance(a, b) > 60 || contrast(a, b) > 1.8;

describe('palette', () => {
  afterEach(() => setColorBlind(false));

  it('is the normal one until colour-blind mode is switched on, and switches back', () => {
    expect(palette()).toBe(NORMAL);
    setColorBlind(true);
    expect(palette()).toBe(COLOR_BLIND);
    expect(playerColor(1)).toBe(COLOR_BLIND.players[1]);
    setColorBlind(false);
    expect(palette()).toBe(NORMAL);
  });

  it('both modes tell the teams, the shots and the warnings apart', () => {
    for (const p of [NORMAL, COLOR_BLIND]) {
      expect(p.teams[0]).not.toBe(p.teams[1]);
      expect(apart(p.teams[0], p.teams[1])).toBe(true);
      expect(apart(p.hostileShot, p.playerShot)).toBe(true);
      expect(p.angryEyes).not.toBe(p.eyes);
      // a team's players wear the team colour
      expect(p.players[1]).toBe(p.teams[0]);
      expect(p.players[0]).toBe(p.teams[1]);
    }
  });

  it('colour-blind mode drops red against green: the red team turns orange, warnings blink', () => {
    const red = NORMAL.teams[0];
    expect(COLOR_BLIND.teams[0]).not.toBe(red);
    // orange: more green in it than the red had
    expect((COLOR_BLIND.teams[0] >> 8) & 255).toBeGreaterThan(((red >> 8) & 255) + 40);
    expect(COLOR_BLIND.teamMarks).toBe(true);
    expect(NORMAL.teamMarks).toBe(false);
    expect(COLOR_BLIND.blinkWarnings).toBe(true);
    // the suit colours stay ten different ones
    expect(new Set(COLOR_BLIND.players).size).toBe(COLOR_BLIND.players.length);
  });

  it('the colour-blind health ramp gets darker as health drops, not just redder', () => {
    const full = COLOR_BLIND.health(1), half = COLOR_BLIND.health(0.5), empty = COLOR_BLIND.health(0);
    expect(luminance(full)).toBeGreaterThan(luminance(half));
    expect(luminance(half)).toBeGreaterThan(luminance(empty));
    expect(contrast(full, empty)).toBeGreaterThan(3);
    expect(hueDistance(full, empty)).toBeGreaterThan(120);
  });

  it('the normal health ramp stays green to red', () => {
    const full = NORMAL.health(1), empty = NORMAL.health(0);
    expect((full >> 8) & 255).toBeGreaterThan((full >> 16) & 255);
    expect((empty >> 16) & 255).toBeGreaterThan((empty >> 8) & 255);
  });

  it('seen with deuteranopia, colour-blind mode keeps the pairs clearly apart where normal mode does not', () => {
    const seen = (a: number, b: number) => dist(deutan(a), deutan(b));
    // the problem: a bar at 60% and one at 30% look much alike in normal mode
    expect(seen(NORMAL.health(0.6), NORMAL.health(0.3))).toBeLessThan(90);
    expect(seen(COLOR_BLIND.health(0.6), COLOR_BLIND.health(0.3))).toBeGreaterThan(100);
    expect(seen(COLOR_BLIND.health(1), COLOR_BLIND.health(0))).toBeGreaterThan(200);
    expect(seen(COLOR_BLIND.teams[0], COLOR_BLIND.teams[1])).toBeGreaterThan(150);
    expect(seen(COLOR_BLIND.hostileShot, COLOR_BLIND.playerShot)).toBeGreaterThan(150);
    expect(seen(COLOR_BLIND.angryEyes, COLOR_BLIND.eyes)).toBeGreaterThan(100);
  });
});
