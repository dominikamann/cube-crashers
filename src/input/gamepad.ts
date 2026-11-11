import { padAt } from '../sim/systems/towers';
import type { Command, Player, SimEvent, SimState, TowerKind, Vec2 } from '../sim/types';
import { instantUse } from './context';
import { FP_AIM, forwardOf, lookOf, PAD_TURN, viewMove, yawOf } from './first-person';
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
/** the build menu's cards from left to right; left/right moves the selection along them */
export const TOWER_ORDER: TowerKind[] = ['laser', 'popcorn', 'frost'];
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
  /** first-person view (View button): the right stick turns, the left stick walks where it looks */
  firstPerson = false;
  yaw = 0;
  private lastNow: number | null = null;
  /** the highlighted card in the build menu: X builds it */
  selected: TowerKind = DEFAULT_TOWER;
  /** the X press that is still held opened the build menu (so letting go is not "use") */
  private xOpened = false;
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

  /** switch first person on or off from outside (versus starts in it), looking along `aim` */
  setFirstPerson(on: boolean, aim: Vec2): void {
    this.firstPerson = on;
    if (on) this.yaw = yawOf(aim);
  }

  onEvents(events: SimEvent[]): void {
    if (events.some(e => (e.type === 'towerBuilt' || e.type === 'towerUpgrade') && e.padId === this.menuPad)) {
      this.closeMenu();
      // holding on builds the tower, without opening the menu again
      this.xSince = null;
    }
  }

  /** After a pause: buttons still held (`pad`) do not count as new presses when play resumes. */
  releaseAll(pad?: PadSnapshot): void {
    this.prev = pad ? pad.buttons.map(b => b.pressed) : [];
    this.xSince = null;
    this.closeMenu();
  }

  private closeMenu() {
    this.buildMenuOpen = false;
    this.menuPad = null;
  }

  commands(pad: PadSnapshot, s: SimState, playerId: number, now: number): Command[] {
    const press = (i: number) => this.pressed(pad, i);
    const out: Command[] = [];
    const p = s.players.find(pl => pl.id === playerId);

    if (s.run.stage === 'shop') {
      DPAD_SHOP.forEach((b, i) => press(b) && out.push({ type: 'buy', playerId, offer: i }));
      if (press(PAD.A)) out.push({ type: 'ready', playerId });
      this.remember(pad);
      return out;
    }

    const dt = this.lastNow === null ? 0 : Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (press(PAD.BACK)) {
      this.firstPerson = !this.firstPerson;
      if (this.firstPerson && p) this.yaw = yawOf(lookOf(p));
    }
    const move = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, DEADZONE);
    if (this.firstPerson) {
      // the right stick turns the view; the left one walks relative to it; RT fires
      const turn = stick(pad.axes[2] ?? 0, 0, AIM_DEADZONE).x;
      this.yaw -= turn * PAD_TURN * dt;
      out.push({ type: 'move', playerId, dir: viewMove(this.yaw, move.x, -move.z) });
      const f = forwardOf(this.yaw);
      this.aimDir = f;
      if (p) out.push({ type: 'aim', playerId, point: { x: p.pos.x + f.x * FP_AIM, z: p.pos.z + f.z * FP_AIM } });
      if ((pad.buttons[PAD.RT]?.value ?? 0) > TRIGGER_FIRE) out.push({ type: 'fire', playerId });
      return this.actions(pad, s, p, playerId, now, out);
    }
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
    return this.actions(pad, s, p, playerId, now, out);
  }

  /** everything but moving and aiming: jump, dash, use and build, weapons, zoom */
  private actions(pad: PadSnapshot, s: SimState, p: Player | undefined, playerId: number, now: number, out: Command[]): Command[] {
    const down = (i: number) => !!pad.buttons[i]?.pressed;
    const press = (i: number) => this.pressed(pad, i);

    if (press(PAD.A)) out.push({ type: 'jump', playerId });
    if (down(PAD.A)) out.push({ type: 'fly', playerId });
    // B closes an open build menu instead of dashing
    if (press(PAD.B)) {
      if (this.buildMenuOpen) this.closeMenu();
      else out.push({ type: 'dash', playerId });
    }

    const onPad = p && p.downUntil === null ? padAt(s, p.pos) : null;
    const tower = onPad === null ? undefined : s.towers.find(t => t.padId === onPad);
    // a tower still being built just gets built while X is held; a finished one offers its upgrade
    const menuPad = onPad !== null && (!tower || tower.buildLeft === 0) ? onPad : null;
    if (menuPad === null) this.closeMenu();

    // X is the E key: on a build pad it opens the build menu, and pressed again builds the selected card;
    // elsewhere a tap is "use" (karts) and holding plants, repairs, helps up
    let pick = false;
    if (press(PAD.X)) {
      this.xSince = now;
      if (p && instantUse(s, p)) {
        // getting in or out of a kart happens on the press itself
        out.push({ type: 'use', playerId });
        this.xSince = null;
      } else if (this.buildMenuOpen) {
        pick = true;
        this.xSince = null;
      } else if (menuPad !== null) {
        this.buildMenuOpen = true;
        this.menuPad = menuPad;
        this.selected = DEFAULT_TOWER;
        this.xOpened = true;
      }
    }
    if (!down(PAD.X) && this.prev[PAD.X]) {
      // a short tap away from a build pad is "use"
      if (this.xSince !== null && now - this.xSince < BUILD_HOLD_MS && !this.xOpened) out.push({ type: 'use', playerId });
      this.xSince = null;
      this.xOpened = false;
    }
    if (down(PAD.X)) out.push({ type: 'hold', playerId });

    if (this.buildMenuOpen && !tower) {
      // left/right (d-pad or bumpers) moves along the cards
      const step = (press(PAD.RIGHT) || press(PAD.RB) ? 1 : 0) - (press(PAD.LEFT) || press(PAD.LB) ? 1 : 0);
      if (step) this.selected = TOWER_ORDER[(TOWER_ORDER.indexOf(this.selected) + step + TOWER_ORDER.length) % TOWER_ORDER.length];
    }
    if (p && p.weapons.length > 0 && !this.buildMenuOpen) {
      const n = p.weapons.length;
      if (press(PAD.RB)) out.push({ type: 'select', playerId, slot: (p.selected + 1) % n });
      if (press(PAD.LB)) out.push({ type: 'select', playerId, slot: (p.selected - 1 + n) % n });
    }
    if (press(PAD.Y)) out.push({ type: 'select', playerId, slot: -1 });
    if (press(PAD.R3)) this.zoomedOut = !this.zoomedOut;

    if (this.buildMenuOpen && this.menuPad !== null) {
      // still holding the X that opened the menu on an empty pad: build the selected tower right away
      if (!tower && this.xOpened && this.xSince !== null && now - this.xSince >= AUTO_BUILD_MS) pick = true;
      if (pick) {
        // one build per press: the tower shows up only a tick (or a snapshot) later
        this.xSince = null;
        out.push(tower ? { type: 'upgrade', playerId, padId: this.menuPad } : { type: 'build', playerId, padId: this.menuPad, tower: this.selected });
      }
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
