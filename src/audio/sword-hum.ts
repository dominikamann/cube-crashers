import type { Player, SimState } from '../sim/types';
import type { SoundId } from './sfx';

/**
 * The hum of a drawn Laser Sword. `level`: how loud it is at rest (the effects play at 0.1 to 0.4, it must be
 * easy to live with for minutes); `swell`: how much louder and `rise`: how much higher it gets when the player
 * turns or runs with it; `others`: how loud someone else's sword is right next to you, against your own;
 * `hear`: from how far off (tiles) one hears it at all.
 */
export const HUM = { level: 0.03, swell: 0.7, rise: 0.12, others: 0.4, hear: 6 };
/** the voices of the hum: the sword of player 1, of player 2 in split screen, and the nearest sword of anyone else */
export const HUM_VOICES = 3;
/** how fast the motion of a sword is taken up and let go (seconds) */
const MOTION_EASE = 0.15;

/** what the hum should do this frame: how loud and how high each voice is, and what to play once */
export interface HumFrame {
  voices: { level: number; pitch: number }[];
  cues: SoundId[];
}

/** whether a player has the sword drawn: up, on foot, with the sword (not a rare weapon) in hand */
export function swordDrawn(p: Player): boolean {
  return p.downUntil === null && !p.out && p.vehicleId === null && !(p.rare && p.rareSelected) && p.weapons[p.selected]?.kind === 'laserSword';
}

/**
 * Keeps track of the swords of the players on this screen from frame to frame (pure: no audio in it, so it can
 * be tested). `live`: a match is being played and shown (not paused, not in a menu, not over, not the kill
 * cam); when it is not, every voice is silent. The blade lights (a cue) when a player takes the sword or comes
 * back with it in hand, and goes out (a cue) when they put it away for another weapon or a vehicle; going down
 * just silences it.
 */
export class SwordHum {
  private drawn = new Map<number, boolean>();
  private last = new Map<number, { x: number; z: number; aim: number }>();
  private motion = new Map<number, number>();

  frame(s: SimState, ids: readonly number[], live: boolean, dt: number): HumFrame {
    const voices = Array.from({ length: HUM_VOICES }, () => ({ level: 0, pitch: 1 }));
    const cues: SoundId[] = [];
    ids.forEach((id, view) => {
      const p = s.players.find(x => x.id === id);
      const drawn = !!p && swordDrawn(p);
      const was = this.drawn.get(id) ?? false;
      this.drawn.set(id, drawn);
      if (live && drawn && !was) cues.push('swordOn');
      if (live && !drawn && was && p && p.downUntil === null && !p.out) cues.push('swordOff');
      if (!p) return;
      const m = this.move(p, dt);
      if (live && drawn && view < HUM_VOICES - 1) voices[view] = { level: HUM.level * (1 + HUM.swell * m), pitch: 1 + HUM.rise * m };
    });
    // someone else's sword close by: quieter, and only the nearest one
    if (live) {
      const ears = s.players.filter(p => ids.includes(p.id));
      let near = 0;
      for (const p of s.players) {
        if (ids.includes(p.id) || !swordDrawn(p)) continue;
        for (const e of ears) near = Math.max(near, 1 - Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) / HUM.hear);
      }
      if (near > 0) voices[HUM_VOICES - 1] = { level: HUM.level * HUM.others * near * near, pitch: 0.96 };
    }
    return { voices, cues };
  }

  /** how much a player turns and runs (0 to 1), eased: the hum swells and climbs with it */
  private move(p: Player, dt: number): number {
    const aim = Math.atan2(p.aim.x, p.aim.z);
    const last = this.last.get(p.id);
    this.last.set(p.id, { x: p.pos.x, z: p.pos.z, aim });
    let want = 0;
    if (last && dt > 0) {
      const turn = Math.abs(Math.atan2(Math.sin(aim - last.aim), Math.cos(aim - last.aim))) / dt;
      const run = Math.hypot(p.pos.x - last.x, p.pos.z - last.z) / dt;
      // (a jump of the position is a respawn or a teleport, not a run)
      want = Math.min(1, turn / 9 + (run < 30 ? run / 12 : 0));
    }
    const k = dt > 0 ? 1 - Math.exp(-dt / MOTION_EASE) : 0;
    const m = (this.motion.get(p.id) ?? 0) + (want - (this.motion.get(p.id) ?? 0)) * k;
    this.motion.set(p.id, m);
    return m;
  }
}

/** the voices of the hum, made once: they run all the time and are only turned up and down */
export interface HumVoices {
  set(frame: HumFrame['voices']): void;
  /** every voice goes quiet at once */
  silence(): void;
}

/** the base note of each voice: the two players' swords a little apart, so two hums do not sound as one */
const BASE = [82, 87, 78];

/**
 * A hum made of oscillators: two sawtooths a little apart that beat slowly, a soft square an octave above them
 * (small speakers hardly give the low note; this they do), all through a low filter so only a warm buzz is
 * left, and a slow waver on its loudness.
 */
export function createHumVoices(ctx: BaseAudioContext, dest: AudioNode): HumVoices {
  const voices = BASE.map(base => {
    const out = ctx.createGain();
    out.gain.value = 0;
    const waver = ctx.createGain();
    waver.gain.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.2;
    const oscs = [
      { wave: 'sawtooth' as const, mul: 1, gain: 0.5 },
      { wave: 'sawtooth' as const, mul: 1.018, gain: 0.32 },
      { wave: 'square' as const, mul: 2, gain: 0.14 },
    ].map(o => {
      const osc = ctx.createOscillator();
      osc.type = o.wave;
      osc.frequency.value = base * o.mul;
      const g = ctx.createGain();
      g.gain.value = o.gain;
      osc.connect(g).connect(filter);
      osc.start();
      return { osc, mul: o.mul };
    });
    // (the waver: a slow wobble of a tenth of its loudness)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.7 + base * 0.01;
    const depth = ctx.createGain();
    depth.gain.value = 0.1;
    lfo.connect(depth).connect(waver.gain);
    lfo.start();
    filter.connect(waver).connect(out).connect(dest);
    return { out, oscs, filter, base, level: 0 };
  });
  return {
    set(frame) {
      const now = ctx.currentTime;
      frame.forEach((f, i) => {
        const v = voices[i];
        if (!v) return;
        // (only what changes is sent on: a voice that stays silent costs nothing per frame)
        if (f.level === 0 && v.level === 0) return;
        v.out.gain.setTargetAtTime(f.level, now, f.level > v.level ? 0.06 : 0.04);
        for (const o of v.oscs) o.osc.frequency.setTargetAtTime(v.base * o.mul * f.pitch, now, 0.08);
        v.filter.frequency.setTargetAtTime(420 * f.pitch * f.pitch, now, 0.08);
        v.level = f.level;
      });
    },
    silence() {
      for (const v of voices) {
        v.out.gain.cancelScheduledValues(ctx.currentTime);
        v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        v.level = 0;
      }
    },
  };
}
