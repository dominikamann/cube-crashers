import { padAt } from '../sim/systems/towers';
import type { Command, SimState, TowerKind } from '../sim/types';

export const BUILD_HOLD_MS = 150;
const TOWER_KEYS: Record<string, TowerKind> = { Digit1: 'laser', Digit2: 'popcorn', Digit3: 'frost', Numpad1: 'laser', Numpad2: 'popcorn', Numpad3: 'frost' };

/** Turns key state into sim commands. Times are passed in so it can be tested without a DOM. */
export class Keyboard {
  buildMenuOpen = false;
  /** the pad the open menu belongs to */
  menuPad: number | null = null;
  private down = new Set<string>();
  private eSince: number | null = null;
  private chosen: TowerKind | null = null;

  keyDown(code: string, now: number): void {
    if (code === 'KeyE' && !this.down.has('KeyE')) this.eSince = now;
    this.down.add(code);
    if (this.buildMenuOpen && TOWER_KEYS[code]) this.chosen = TOWER_KEYS[code];
  }

  keyUp(code: string): void {
    this.down.delete(code);
    if (code === 'KeyE') {
      this.eSince = null;
      this.closeMenu();
    }
  }

  /** Called when the window loses focus: forget all held keys. */
  releaseAll(): void {
    this.down.clear();
    this.eSince = null;
    this.closeMenu();
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
    const cmds: Command[] = [{ type: 'move', playerId, dir: { x, z } }];

    const p = s.players.find(pl => pl.id === playerId);
    const pad = p && p.downUntil === null ? padAt(s, p.pos) : null;
    if (this.eSince !== null && pad !== null && now - this.eSince >= BUILD_HOLD_MS) {
      this.buildMenuOpen = true;
      this.menuPad = pad;
    } else if (pad === null) {
      this.closeMenu();
    }

    if (this.buildMenuOpen && this.chosen && this.menuPad !== null) {
      cmds.push({ type: 'build', playerId, padId: this.menuPad, tower: this.chosen });
      this.closeMenu();
      this.eSince = null;
    }
    return cmds;
  }
}
