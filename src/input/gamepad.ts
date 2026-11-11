import { padAt } from '../sim/systems/towers';
import type { Command, SimEvent, SimState, TowerKind, Vec2 } from '../sim/types';
import { AUTO_BUILD_MS, BUILD_HOLD_MS, DEFAULT_TOWER } from './keyboard';

/** What we read from a browser Gamepad each frame (kept plain so it can be tested without a DOM). */
export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** Button indices of the standard mapping (Xbox layout). */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

const DEADZONE = 0.2;
const AIM_DEADZONE = 0.3;
/** the right stick pushed this far fires on its own (twin-stick style) */
const STICK_FIRE = 0.75;
const TRIGGER_FIRE = 0.35;
/** how far ahead of the player the crosshair sits: pushing the right stick further looks further ahead */
const AIM_NEAR = 3;
const AIM_FAR = 8;
/** d-pad in the build menu: left, up, right */
const DPAD_TOWERS: [number, TowerKind][] = [
  [PAD.LEFT, 'laser'],
  [PAD.UP, 'popcorn'],
  [PAD.RIGHT, 'frost'],
];
/** d-pad in the elevator shop: offers 1 to 4 */
const DPAD_SHOP = [PAD.LEFT, PAD.UP, PAD.RIGHT, PAD.DOWN];

/** what a browser Gamepad looks like (only the parts we read) */
export interface RawPad extends PadSnapshot {
  id: string;
  mapping: string;
}

/**
 * Pads the browser maps to the standard layout pass through. Others (an Xbox pad in some Mac browsers) report
 * the sticks on axes 0,1 and 3,4 with the triggers as axes 2 and 5 (-1 released, 1 pulled): bring those into
 * the standard order and turn the right trigger axis into button 7.
 */
export function normalizePad(g: RawPad): PadSnapshot {
  if (g.mapping === 'standard' || g.axes.length < 6) return g;
  const buttons = g.buttons.map(b => ({ pressed: b.pressed, value: b.value }));
  while (buttons.length < 17) buttons.push({ pressed: false, value: 0 });
  const rt = (g.axes[5] + 1) / 2;
  if (rt > buttons[7].value) buttons[7] = { pressed: rt > 0.5, value: rt };
  return { axes: [g.axes[0], g.axes[1], g.axes[3], g.axes[4]], buttons };
}

/** PlayStation pads get their own button symbols in the hints */
export function padFamily(id: string): 'playstation' | 'xbox' {
  return /054c|dualsense|dualshock|playstation|wireless controller \(standard gamepad vendor: 054c/i.test(id) ? 'playstation' : 'xbox';
}

/** a stick with a radial deadzone, rescaled so it starts at 0 right outside the deadzone */
function stick(x: number, y: number, dead: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len < dead) return { x: 0, z: 0 };
  const k = Math.min(1, (len - dead) / (1 - dead)) / len;
  return { x: x * k, z: y * k };
}

/** Turns an Xbox-style controller into sim commands for one player: twin-stick, like Keyboard for the keys. */
export class PadControls {
  buildMenuOpen = false;
  menuPad: number | null = null;
  private prev: boolean[] = [];
  private xSince: number | null = null;
  private aimDir: Vec2 = { x: 0, z: -1 };
  /** right stick deflection last frame, to tell a push from the stick springing back */
  private prevAim = 0;

  /** buttons that went down this frame */
  private pressed(pad: PadSnapshot, i: number): boolean {
    return !!pad.buttons[i]?.pressed && !this.prev[i];
  }

  /** zoomed out (toggled with R3) */
  zoomedOut = false;

  /** true once when Start goes down (pause) */
  startPressed(pad: PadSnapshot): boolean {
    return this.pressed(pad, PAD.START);
  }

  onEvents(events: SimEvent[]): void {
    if (events.some(e => (e.type === 'towerBuilt' || e.type === 'towerUpgrade') && e.padId === this.menuPad)) {
      this.closeMenu();
      // holding on builds the tower, without opening the menu again
      this.xSince = null;
    }
  }

  releaseAll(): void {
    this.prev = [];
    this.xSince = null;
    this.closeMenu();
  }

  private closeMenu() {
    this.buildMenuOpen = false;
    this.menuPad = null;
  }

  commands(pad: PadSnapshot, s: SimState, playerId: number, now: number): Command[] {
    const down = (i: number) => !!pad.buttons[i]?.pressed;
    const press = (i: number) => this.pressed(pad, i);
    const out: Command[] = [];
    const p = s.players.find(pl => pl.id === playerId);

    if (s.run.stage === 'shop') {
      DPAD_SHOP.forEach((b, i) => press(b) && out.push({ type: 'buy', playerId, offer: i }));
      if (press(PAD.A)) out.push({ type: 'ready', playerId });
      this.remember(pad);
      return out;
    }

    const move = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, DEADZONE);
    out.push({ type: 'move', playerId, dir: move });

    const aim = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, AIM_DEADZONE);
    const aimLen = Math.hypot(aim.x, aim.z);
    const rawAimLen = Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    // a stick springing back to the centre overshoots: only a deliberate push (steady or growing) turns the aim
    const pushing = rawAimLen >= this.prevAim - 0.08 || rawAimLen > 0.85;
    this.prevAim = rawAimLen;
    // without the right stick the crosshair follows the walking direction
    if (aimLen > 0) {
      if (pushing) this.aimDir = { x: aim.x / aimLen, z: aim.z / aimLen };
    }
    else if (Math.hypot(move.x, move.z) > 0.3) {
      const l = Math.hypot(move.x, move.z);
      this.aimDir = { x: move.x / l, z: move.z / l };
    }
    const reach = aimLen > 0 ? AIM_NEAR + (AIM_FAR - AIM_NEAR) * Math.min(1, aimLen) : AIM_NEAR + 2;
    if (p) out.push({ type: 'aim', playerId, point: { x: p.pos.x + this.aimDir.x * reach, z: p.pos.z + this.aimDir.z * reach } });
    const rawAim = Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    if ((pad.buttons[PAD.RT]?.value ?? 0) > TRIGGER_FIRE || rawAim > STICK_FIRE) out.push({ type: 'fire', playerId });

    if (press(PAD.A)) out.push({ type: 'jump', playerId });
    if (down(PAD.A)) out.push({ type: 'fly', playerId });
    // B closes an open build menu instead of dashing
    if (press(PAD.B)) {
      if (this.buildMenuOpen) this.closeMenu();
      else out.push({ type: 'dash', playerId });
    }

    // X is the E key: a short tap gets in or out of a kart, holding plants, builds, repairs, helps up
    if (press(PAD.X)) this.xSince = now;
    // letting go keeps an open build menu open, so the d-pad can be used without holding X
    let tapPick = false;
    if (!down(PAD.X) && this.prev[PAD.X]) {
      // with the build menu open a tap of X builds the preselected tower; otherwise a tap is "use"
      if (this.xSince !== null && now - this.xSince < BUILD_HOLD_MS) {
        if (this.buildMenuOpen) tapPick = true;
        else out.push({ type: 'use', playerId });
      }
      this.xSince = null;
    }
    if (down(PAD.X)) out.push({ type: 'hold', playerId });

    if (p && p.weapons.length > 0 && !this.buildMenuOpen) {
      const n = p.weapons.length;
      if (press(PAD.RB)) out.push({ type: 'select', playerId, slot: (p.selected + 1) % n });
      if (press(PAD.LB)) out.push({ type: 'select', playerId, slot: (p.selected - 1 + n) % n });
    }
    if (press(PAD.Y)) out.push({ type: 'select', playerId, slot: -1 });
    if (press(PAD.R3)) this.zoomedOut = !this.zoomedOut;

    const onPad = p && p.downUntil === null ? padAt(s, p.pos) : null;
    const tower = onPad === null ? undefined : s.towers.find(t => t.padId === onPad);
    const menuPad = onPad !== null && (!tower || tower.buildLeft === 0) ? onPad : null;
    if (this.xSince !== null && menuPad !== null && now - this.xSince >= BUILD_HOLD_MS) {
      this.buildMenuOpen = true;
      this.menuPad = menuPad;
    } else if (menuPad === null) {
      this.closeMenu();
    }
    if (this.buildMenuOpen && this.menuPad !== null) {
      let pick: TowerKind | null = null;
      for (const [b, kind] of DPAD_TOWERS) if (press(b)) pick ??= kind;
      if (tapPick) pick ??= DEFAULT_TOWER;
      // still holding X on an empty pad: build the preselected tower right away
      if (!tower && this.xSince !== null && now - this.xSince >= AUTO_BUILD_MS) pick ??= DEFAULT_TOWER;
      if (pick) out.push(tower ? { type: 'upgrade', playerId, padId: this.menuPad } : { type: 'build', playerId, padId: this.menuPad, tower: pick });
    }
    this.remember(pad);
    return out;
  }

  private remember(pad: PadSnapshot) {
    this.prev = pad.buttons.map(b => b.pressed);
  }
}

/** Menu navigation edges from a pad: up/down/left/right (d-pad or left stick), A confirm, B back. */
export class PadMenu {
  private prev = { up: false, down: false, left: false, right: false, a: false, b: false, start: false };

  read(pad: PadSnapshot): { up: boolean; down: boolean; left: boolean; right: boolean; a: boolean; b: boolean; start: boolean } {
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const ly = pad.axes[1] ?? 0, lx = pad.axes[0] ?? 0;
    const now = {
      up: b(PAD.UP) || ly < -0.6,
      down: b(PAD.DOWN) || ly > 0.6,
      left: b(PAD.LEFT) || lx < -0.6,
      right: b(PAD.RIGHT) || lx > 0.6,
      a: b(PAD.A),
      b: b(PAD.B),
      start: b(PAD.START),
    };
    const edges = {
      up: now.up && !this.prev.up,
      down: now.down && !this.prev.down,
      left: now.left && !this.prev.left,
      right: now.right && !this.prev.right,
      a: now.a && !this.prev.a,
      b: now.b && !this.prev.b,
      start: now.start && !this.prev.start,
    };
    this.prev = now;
    return edges;
  }
}
