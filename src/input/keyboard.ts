import { padAt } from '../sim/systems/towers';
import type { Command, SimEvent, SimState, TowerKind, Vec2 } from '../sim/types';

export const BUILD_HOLD_MS = 150;
const TOWER_KEYS: Record<string, TowerKind> = { Digit1: 'laser', Digit2: 'popcorn', Digit3: 'frost', Numpad1: 'laser', Numpad2: 'popcorn', Numpad3: 'frost' };

/** Turns key state into sim commands. Times are passed in so it can be tested without a DOM. */
export class Keyboard {
  buildMenuOpen = false;
  /** on foot, W walks toward the crosshair instead of up the screen */
  steerWithMouse = false;
  private forward: Vec2 = { x: 0, z: -1 };
  /** the pad the open menu belongs to */
  menuPad: number | null = null;
  private down = new Set<string>();
  private eSince: number | null = null;
  private chosen: TowerKind | null = null;
  private jump = false;
  private dash = false;
  private use = false;
  private firing = false;
  private aim: Vec2 | null = null;
  private slot: number | null = null;
  private wheelSteps = 0;

  keyDown(code: string, now: number): void {
    if (code === 'KeyE' && !this.down.has('KeyE')) this.eSince = now;
    if (code === 'Space' && !this.down.has('Space')) this.jump = true;
    if (code.startsWith('Shift') && !this.down.has(code)) this.dash = true;
    this.down.add(code);
    if (this.buildMenuOpen) {
      if (TOWER_KEYS[code]) this.chosen = TOWER_KEYS[code];
    } else {
      const digit = /^(?:Digit|Numpad)([1-6])$/.exec(code);
      if (digit) this.slot = Number(digit[1]) - 1;
    }
  }

  /** where the mouse points on the ground, or null when it is outside the game */
  setAim(point: Vec2 | null): void {
    this.aim = point;
  }

  mouseDown(): void {
    this.firing = true;
  }

  mouseUp(): void {
    this.firing = false;
  }

  /** one step per notch; positive = next weapon */
  wheel(steps: number): void {
    this.wheelSteps += Math.sign(steps);
  }

  /** `now` lets a short tap of E (get in/out of a kart) be told apart from holding it (plant, build) */
  keyUp(code: string, now = Infinity): void {
    this.down.delete(code);
    if (code === 'KeyE') {
      if (this.eSince !== null && now - this.eSince < BUILD_HOLD_MS) this.use = true;
      this.eSince = null;
      this.closeMenu();
    }
  }

  /** Called when the window loses focus: forget all held keys. */
  releaseAll(): void {
    this.down.clear();
    this.eSince = null;
    this.firing = false;
    this.jump = this.dash = this.use = false;
    this.slot = null;
    this.wheelSteps = 0;
    this.closeMenu();
  }

  /** The menu stays open until the sim confirms the build, so a denied build can shake the cards. */
  onEvents(events: SimEvent[]): void {
    if (events.some(e => e.type === 'towerBuilt' && e.padId === this.menuPad)) {
      this.closeMenu();
      this.eSince = null;
    }
  }

  chooseTower(kind: TowerKind): void {
    if (this.buildMenuOpen) this.chosen = kind;
  }

  private closeMenu() {
    this.buildMenuOpen = false;
    this.menuPad = null;
    this.chosen = null;
  }

  commands(s: SimState, playerId: number, now: number): Command[] {
    const has = (...codes: string[]) => codes.some(c => this.down.has(c));
    let x = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    let z = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    const p = s.players.find(pl => pl.id === playerId);
    // on foot only: a kart is always steered with the keys alone, the mouse just aims
    if (this.steerWithMouse && p && p.vehicleId === null && this.aim) {
      const fx = this.aim.x - p.pos.x, fz = this.aim.z - p.pos.z;
      const fl = Math.hypot(fx, fz);
      // too close to tell a direction: keep the last one
      if (fl > 0.6) this.forward = { x: fx / fl, z: fz / fl };
      const ahead = -z, side = x;
      x = this.forward.x * ahead - this.forward.z * side;
      z = this.forward.z * ahead + this.forward.x * side;
    }
    const cmds: Command[] = [{ type: 'move', playerId, dir: { x, z } }];

    if (this.aim) cmds.push({ type: 'aim', playerId, point: { ...this.aim } });
    if (this.firing) cmds.push({ type: 'fire', playerId });
    if (this.jump) cmds.push({ type: 'jump', playerId });
    if (this.dash) cmds.push({ type: 'dash', playerId });
    if (this.use) cmds.push({ type: 'use', playerId });
    if (this.down.has('KeyE')) cmds.push({ type: 'hold', playerId });
    this.jump = this.dash = this.use = false;
    if (p && this.wheelSteps !== 0 && p.weapons.length > 0) {
      const n = p.weapons.length;
      this.slot = (((p.selected + this.wheelSteps) % n) + n) % n;
    }
    this.wheelSteps = 0;
    if (this.slot !== null) cmds.push({ type: 'select', playerId, slot: this.slot });
    this.slot = null;

    const pad = p && p.downUntil === null ? padAt(s, p.pos) : null;
    if (this.eSince !== null && pad !== null && now - this.eSince >= BUILD_HOLD_MS) {
      this.buildMenuOpen = true;
      this.menuPad = pad;
    } else if (pad === null) {
      this.closeMenu();
    }

    if (this.buildMenuOpen && this.chosen && this.menuPad !== null) {
      cmds.push({ type: 'build', playerId, padId: this.menuPad, tower: this.chosen });
      this.chosen = null;
    }
    return cmds;
  }
}
