import { padAt } from '../sim/systems/towers';
import { instantUse } from './context';
import { FP_AIM, forwardOf, MOUSE_TURN, viewMove, yawOf } from './first-person';
import type { Command, SimEvent, SimState, TowerKind, Vec2 } from '../sim/types';

/** the build menu's cards from left to right */
const TOWER_ORDER: TowerKind[] = ['laser', 'popcorn', 'frost'];

export const BUILD_HOLD_MS = 150;
/** keep holding E this long on an empty pad and the preselected (first) tower gets built */
export const AUTO_BUILD_MS = 700;
/** the card that is preselected when the build menu opens */
export const DEFAULT_TOWER: TowerKind = 'laser';
const TOWER_KEYS: Record<string, TowerKind> = { Digit1: 'laser', Digit2: 'popcorn', Digit3: 'frost', Numpad1: 'laser', Numpad2: 'popcorn', Numpad3: 'frost' };

/** Turns key state into sim commands. Times are passed in so it can be tested without a DOM. */
export class Keyboard {
  buildMenuOpen = false;
  /** on foot, W walks toward the crosshair instead of up the screen */
  steerWithMouse = false;
  /** first-person view (V): the mouse turns the view, W walks where it looks */
  firstPerson = false;
  /** where the first-person view looks (see forwardOf) */
  yaw = 0;
  private toggleView = false;
  private forward: Vec2 = { x: 0, z: -1 };
  /** the pad the open menu belongs to */
  menuPad: number | null = null;
  /** the highlighted card in the build menu: E builds it */
  selected: TowerKind = DEFAULT_TOWER;
  /** the E press that is still held opened the build menu (so letting go is not "use") */
  private eOpened = false;
  /** E went down and up again before commands() saw the press */
  private eTapPending = false;
  private down = new Set<string>();
  private eSince: number | null = null;
  private chosen: TowerKind | null = null;
  private jump = false;
  private dash = false;
  private use = false;
  /** E went down since the last commands(): maybe a kart wants it right away */
  private ePressed = false;
  private firing = false;
  private aim: Vec2 | null = null;
  private slot: number | null = null;
  private wheelSteps = 0;
  private buys: number[] = [];
  private readyPressed = false;
  private shopKey: number | null = null;

  keyDown(code: string, now: number): void {
    if (code === 'KeyE' && !this.down.has('KeyE')) {
      this.eSince = now;
      this.ePressed = true;
    }
    if (code === 'Space' && !this.down.has('Space')) this.jump = true;
    if (code.startsWith('Shift') && !this.down.has(code)) this.dash = true;
    if (code === 'KeyV' && !this.down.has(code)) this.toggleView = true;
    this.down.add(code);
    if (this.buildMenuOpen) {
      if (TOWER_KEYS[code]) this.chosen = TOWER_KEYS[code];
    } else {
      const digit = /^(?:Digit|Numpad)([1-6])$/.exec(code);
      if (digit) this.slot = Number(digit[1]) - 1;
      if (code === 'KeyQ') this.slot = -1;
      if (digit) this.shopKey = Number(digit[1]) - 1;
      if (code === 'Enter' || code === 'KeyR') this.readyPressed = true;
    }
  }

  /** elevator shop: buy offer `i` (clicked) */
  buy(i: number): void {
    this.buys.push(i);
  }

  ready(): void {
    this.readyPressed = true;
  }

  /** mouse movement while the pointer is captured (first person): turns the view */
  look(dx: number, _dy: number): void {
    if (this.firstPerson) this.yaw -= dx * MOUSE_TURN;
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
      // with the build menu open a tap of E builds the preselected tower; otherwise a tap is "use"
      // a press commands() has not seen yet decides there whether it was "use"
      if (this.ePressed) this.eTapPending = true;
      // a short tap away from a build pad is "use"
      else if (this.eSince !== null && now - this.eSince < BUILD_HOLD_MS && !this.eOpened && !this.buildMenuOpen) this.use = true;
      this.eSince = null;
      this.eOpened = false;
    }
  }

  /** Called when the window loses focus: forget all held keys. */
  releaseAll(): void {
    this.down.clear();
    this.eSince = null;
    this.firing = false;
    this.jump = this.dash = this.use = this.ePressed = this.eTapPending = false;
    this.slot = null;
    this.wheelSteps = 0;
    this.closeMenu();
  }

  /** The menu stays open until the sim confirms the build, so a denied build can shake the cards. */
  onEvents(events: SimEvent[]): void {
    if (events.some(e => (e.type === 'towerBuilt' || e.type === 'towerUpgrade') && e.padId === this.menuPad)) {
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
    if (s.run.stage === 'shop') {
      // in the shop the number keys buy and Enter/R says ready
      const out: Command[] = [];
      if (this.shopKey !== null) out.push({ type: 'buy', playerId, offer: this.shopKey });
      for (const i of this.buys) out.push({ type: 'buy', playerId, offer: i });
      if (this.readyPressed) out.push({ type: 'ready', playerId });
      this.shopKey = null;
      this.buys = [];
      this.readyPressed = false;
      this.slot = null;
      this.jump = this.dash = this.use = this.ePressed = this.eTapPending = false;
      return out;
    }
    this.shopKey = null;
    this.buys = [];
    this.readyPressed = false;
    if (this.toggleView) {
      this.toggleView = false;
      this.firstPerson = !this.firstPerson;
      if (this.firstPerson && p) this.yaw = yawOf(p.aim);
    }
    if (this.firstPerson) {
      // first person: W walks (and drives) where the view looks, A and D step sideways
      const d = viewMove(this.yaw, x, -z);
      x = d.x;
      z = d.z;
    }
    // on foot only: a kart is always steered with the keys alone, the mouse just aims
    else if (this.steerWithMouse && p && p.vehicleId === null && this.aim) {
      const fx = this.aim.x - p.pos.x, fz = this.aim.z - p.pos.z;
      const fl = Math.hypot(fx, fz);
      // too close to tell a direction: keep the last one
      if (fl > 0.6) this.forward = { x: fx / fl, z: fz / fl };
      const ahead = -z, side = x;
      x = this.forward.x * ahead - this.forward.z * side;
      z = this.forward.z * ahead + this.forward.x * side;
    }
    const cmds: Command[] = [{ type: 'move', playerId, dir: { x, z } }];
    const onPad = p && p.downUntil === null ? padAt(s, p.pos) : null;
    // a tower still being built just gets built while E is held; a finished one offers its upgrade
    const tower = onPad === null ? undefined : s.towers.find(t => t.padId === onPad);
    const pad = onPad !== null && (!tower || tower.buildLeft === 0) ? onPad : null;
    if (pad === null) this.closeMenu();
    // E acts on the press itself: in or out of a kart, open the build menu, or build the selected card
    if (this.ePressed) {
      this.ePressed = false;
      if (p && instantUse(s, p)) {
        cmds.push({ type: 'use', playerId });
        this.eSince = null;
      } else if (this.buildMenuOpen) {
        this.chosen = this.selected;
        this.eSince = null;
      } else if (pad !== null) {
        this.buildMenuOpen = true;
        this.menuPad = pad;
        this.selected = DEFAULT_TOWER;
        this.eOpened = !this.eTapPending;
      } else if (this.eTapPending) {
        cmds.push({ type: 'use', playerId });
      }
      this.eTapPending = false;
    }
    // in the open menu the wheel moves along the cards instead of switching weapons
    if (this.buildMenuOpen && !tower && this.wheelSteps !== 0) {
      const n = TOWER_ORDER.length;
      this.selected = TOWER_ORDER[(((TOWER_ORDER.indexOf(this.selected) + this.wheelSteps) % n) + n) % n];
      this.wheelSteps = 0;
    }

    if (this.firstPerson && p) {
      const f = forwardOf(this.yaw);
      cmds.push({ type: 'aim', playerId, point: { x: p.pos.x + f.x * FP_AIM, z: p.pos.z + f.z * FP_AIM } });
    } else if (this.aim) cmds.push({ type: 'aim', playerId, point: { ...this.aim } });
    if (this.firing) cmds.push({ type: 'fire', playerId });
    if (this.jump) cmds.push({ type: 'jump', playerId });
    if (this.down.has('Space')) cmds.push({ type: 'fly', playerId });
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

    // still holding the E that opened the menu on an empty pad: build the selected tower right away
    if (this.buildMenuOpen && !tower && this.eOpened && this.eSince !== null && now - this.eSince >= AUTO_BUILD_MS) {
      this.chosen ??= this.selected;
      // one build per press: the tower shows up only a tick (or a snapshot) later
      this.eSince = null;
    }
    if (this.buildMenuOpen && this.chosen && this.menuPad !== null) {
      // on a pad with a tower any of the menu keys picks the single card: the upgrade
      if (tower) cmds.push({ type: 'upgrade', playerId, padId: this.menuPad });
      else cmds.push({ type: 'build', playerId, padId: this.menuPad, tower: this.chosen });
      this.chosen = null;
    }
    return cmds;
  }
}
