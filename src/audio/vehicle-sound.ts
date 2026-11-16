import { VEHICLES } from '../sim/systems/vehicles';
import type { SimState, Vec2, Vehicle, VehicleKind } from '../sim/types';
import { allBosses } from '../sim/util';
import type { SoundId } from './sfx';

/**
 * How a vehicle with an engine sounds (the unicorn has none, it gallops: see the hooves below). `idle` and `top`:
 * the engine's note standing still and at top speed (Hz); `filter`: how bright it is at idle and at top speed;
 * `chug`: how much it putters (0: a smooth whine); `level`: how loud at idle and at top speed; `air`: how loud
 * the rush of air or the rumble of the drum is under it.
 */
export interface EngineSound {
  idle: number;
  top: number;
  filter: [number, number];
  chug: number;
  level: [number, number];
  air: number;
}

export const ENGINES: Record<Exclude<VehicleKind, 'unicorn'>, EngineSound> = {
  // a little two-stroke: puttering at rest, a rasp at full tilt
  kart: { idle: 38, top: 96, filter: [650, 2100], chug: 0.65, level: [0.06, 0.12], air: 0.15 },
  // a car's engine: deeper and smoother than the kart
  police: { idle: 32, top: 78, filter: [420, 1200], chug: 0.35, level: [0.035, 0.065], air: 0.12 },
  // a diesel: low and slow, and the drum rumbles over the floor
  roller: { idle: 26, top: 48, filter: [380, 850], chug: 0.8, level: [0.077, 0.128], air: 0.5 },
  // no engine, a whine of the fans and a rush of air
  hoverboard: { idle: 170, top: 400, filter: [900, 2400], chug: 0, level: [0.018, 0.04], air: 0.6 },
};

/** `others`: how loud someone else's vehicle is right next to you, against your own; `hear`: from how far off
 *  (tiles) one hears it at all; `boost`: how much higher the engine goes with a boost; `airborne`: and in the air
 *  (the wheels spin free) */
export const ENGINE = { others: 0.5, hear: 10, boost: 0.15, airborne: 0.25 };
/** the voices of the engines: the vehicle of player 1, of player 2 in split screen, and the nearest one of anyone else */
export const ENGINE_VOICES = 3;
/** how fast the engine follows the speed (seconds): it revs up and down, it does not jump */
const REV_EASE = 0.18;

/** the unicorn's hooves: a walk (four even steps a stride) below `gallopAt` of its top speed, a gallop (three
 *  quick beats and a pause) above it; `strides`: strides a second standing still and at top speed; `hear`: from
 *  how far off one hears someone else's unicorn */
export const HOOVES = { gallopAt: 0.4, strides: [1.4, 2.6] as [number, number], hear: 9, still: 0.6 };
/** where in a stride each hoof falls (0 to 1), and how high it rings (the last beat of the gallop is the heaviest) */
const WALK = [{ at: 0, pitch: 1.04 }, { at: 0.25, pitch: 0.96 }, { at: 0.5, pitch: 1.02 }, { at: 0.75, pitch: 0.94 }];
const GALLOP = [{ at: 0, pitch: 1.06 }, { at: 0.13, pitch: 1 }, { at: 0.26, pitch: 0.86 }];

/** what the vehicles should sound like this frame: each engine voice and the hooves to play once */
export interface EngineFrame {
  voices: { kind: keyof typeof ENGINES | null; level: number; rev: number }[];
  cues: { id: SoundId; pitch: number }[];
}

/** a vehicle someone is in, and how fast it goes against its top speed (0 to a little over 1 with a boost) */
const pace = (v: Vehicle): number => Math.hypot(v.vel.x, v.vel.z) / VEHICLES[v.kind].speed;

/**
 * Keeps track of the vehicles heard on this screen from frame to frame (pure: no audio in it, so it can be
 * tested). `live`: a match is being played and shown; when it is not, it is all silent. An engine runs while
 * someone drives the vehicle: one's own loud, the nearest one of anyone else more quietly; it revs with the speed.
 * A ridden unicorn's hooves fall with its stride, one's own and the nearest one of anyone else.
 */
export class VehicleSound {
  private rev = new Map<number, number>();
  private stride = new Map<number, number>();

  frame(s: SimState, ids: readonly number[], live: boolean, dt: number): EngineFrame {
    const voices: EngineFrame['voices'] = Array.from({ length: ENGINE_VOICES }, () => ({ kind: null, level: 0, rev: 0 }));
    const cues: EngineFrame['cues'] = [];
    const driven = s.vehicles.filter(v => v.driverId !== null);
    // (a vehicle no one drives any more starts from idle the next time)
    for (const id of [...this.rev.keys()]) if (!driven.some(v => v.id === id)) this.rev.delete(id);
    for (const id of [...this.stride.keys()]) if (!driven.some(v => v.id === id)) this.stride.delete(id);
    if (!live) return { voices, cues };

    const ears = s.players.filter(p => ids.includes(p.id));
    const mine = new Set<number>();
    ids.forEach((id, view) => {
      const p = s.players.find(x => x.id === id);
      const v = p?.vehicleId != null ? driven.find(x => x.id === p.vehicleId) : undefined;
      if (!v || !p || p.downUntil !== null || p.out) return;
      mine.add(v.id);
      if (v.kind === 'unicorn') this.hooves(v, dt, 'hoof', cues);
      else if (view < ENGINE_VOICES - 1) voices[view] = this.engine(v, v.kind, dt, 1, p.boostUntil > s.tick);
    });

    // someone else's vehicle close by: the nearest engine, the nearest unicorn
    let engine: { v: Vehicle; near: number } | null = null;
    let horse: { v: Vehicle; near: number } | null = null;
    for (const v of driven) {
      if (mine.has(v.id)) continue;
      let near = 0;
      for (const e of ears) near = Math.max(near, 1 - Math.hypot(v.pos.x - e.pos.x, v.pos.z - e.pos.z) / (v.kind === 'unicorn' ? HOOVES.hear : ENGINE.hear));
      if (near <= 0) continue;
      if (v.kind === 'unicorn') { if (!horse || near > horse.near) horse = { v, near }; }
      else if (!engine || near > engine.near) engine = { v, near };
    }
    const far = engine;
    if (far && far.v.kind !== 'unicorn') {
      const driver = s.players.find(p => p.id === far.v.driverId);
      voices[ENGINE_VOICES - 1] = this.engine(far.v, far.v.kind, dt, ENGINE.others * far.near * far.near, !!driver && driver.boostUntil > s.tick);
    }
    if (horse) this.hooves(horse.v, dt, 'hoofFar', cues);
    return { voices, cues };
  }

  /** the engine of a vehicle: it revs toward its speed (higher with a boost, and in the air) */
  private engine(v: Vehicle, kind: keyof typeof ENGINES, dt: number, loud: number, boosting: boolean): EngineFrame['voices'][number] {
    const want = Math.min(1, pace(v)) * (1 + (boosting ? ENGINE.boost : 0)) + (v.air > 0 ? ENGINE.airborne : 0);
    const k = dt > 0 ? 1 - Math.exp(-dt / REV_EASE) : 0;
    const rev = (this.rev.get(v.id) ?? 0) + (want - (this.rev.get(v.id) ?? 0)) * k;
    this.rev.set(v.id, rev);
    const e = ENGINES[kind];
    return { kind, level: loud * (e.level[0] + (e.level[1] - e.level[0]) * Math.min(1, rev)), rev };
  }

  /** the hooves of a unicorn: on the ground and on the move, each beat of its stride once */
  private hooves(v: Vehicle, dt: number, id: SoundId, cues: EngineFrame['cues']): void {
    const speed = Math.hypot(v.vel.x, v.vel.z);
    // (the first step of a ride rings at once)
    const at = this.stride.get(v.id) ?? 0.999;
    if (v.air > 0 || speed < HOOVES.still) {
      // (standing or in the air: the next step starts the stride afresh, on its first beat)
      this.stride.set(v.id, 0.999);
      return;
    }
    const f = pace(v);
    const rate = HOOVES.strides[0] + (HOOVES.strides[1] - HOOVES.strides[0]) * Math.min(1, f);
    const next = at + rate * dt;
    const beats = f >= HOOVES.gallopAt ? GALLOP : WALK;
    for (const b of beats) {
      // (a beat between where the stride was and where it is now; past the end, the first ones again)
      const t = b.at < at % 1 ? b.at + 1 : b.at;
      if (t > at && t <= next) cues.push({ id, pitch: b.pitch });
    }
    this.stride.set(v.id, next % 1);
  }
}

/** the engine voices, made once: they run all the time and are only turned up and down */
export interface EngineVoices {
  set(frame: EngineFrame['voices']): void;
  /** every voice goes quiet at once */
  silence(): void;
}

/**
 * An engine made of oscillators: a sawtooth on the note, a square an octave below it, and a rush of noise for the
 * air or the drum; all of it through a low filter that opens as it revs, and puttering with the firing of the
 * cylinders (its loudness pulses with the note, slower than it).
 */
export function createEngineVoices(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer): EngineVoices {
  const voices = Array.from({ length: ENGINE_VOICES }, () => {
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.5;
    // the putter: the loudness pulses with the firing
    const putter = ctx.createGain();
    putter.gain.value = 1;
    const firing = ctx.createOscillator();
    firing.type = 'sawtooth';
    const depth = ctx.createGain();
    depth.gain.value = 0;
    firing.connect(depth).connect(putter.gain);
    firing.start();
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    saw.connect(filter);
    sub.connect(subGain).connect(filter);
    saw.start();
    sub.start();
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    const air = ctx.createGain();
    air.gain.value = 0;
    hiss.connect(band).connect(air).connect(filter);
    hiss.start();
    filter.connect(putter).connect(out).connect(dest);
    return { out, filter, firing, depth, saw, sub, band, air, level: 0, kind: null as keyof typeof ENGINES | null };
  });
  return {
    set(frame) {
      const now = ctx.currentTime;
      frame.forEach((f, i) => {
        const v = voices[i];
        if (!v) return;
        // (only what changes is sent on: a voice that stays silent costs nothing per frame)
        if (f.level === 0 && v.level === 0) return;
        if (f.kind) {
          const e = ENGINES[f.kind];
          const note = e.idle + (e.top - e.idle) * f.rev;
          // (another kind of vehicle in this voice: it takes its sound at once, not sliding over from the last)
          const glide = f.kind === v.kind ? 0.05 : 0;
          const to = (p: AudioParam, x: number) => (glide ? p.setTargetAtTime(x, now, glide) : p.setValueAtTime(x, now));
          to(v.saw.frequency, note);
          to(v.sub.frequency, note / 2);
          to(v.firing.frequency, note / 2);
          to(v.depth.gain, e.chug * 0.5);
          to(v.filter.frequency, e.filter[0] + (e.filter[1] - e.filter[0]) * Math.min(1, f.rev));
          to(v.band.frequency, 300 + 900 * Math.min(1, f.rev));
          to(v.air.gain, e.air * (0.4 + 0.6 * Math.min(1, f.rev)));
          v.kind = f.kind;
        }
        v.out.gain.setTargetAtTime(f.level, now, f.level > v.level ? 0.08 : 0.12);
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

/** the Rhino's feet: heard from `hear` tiles off, louder the closer it is (and louder still in a charge, `charge`);
 *  `strides`: strides a second at a walk and in a charge */
export const RHINO_STEPS = { hear: 30, charge: 1.3, strides: { walk: 1.9, charge: 3.4 }, still: 0.5 };
/** where in a stride each foot falls at a walk (a heavy trot) and in a charge (a gallop) */
const TROT = [{ at: 0, pitch: 1 }, { at: 0.5, pitch: 0.92 }];
const STAMPEDE = [{ at: 0, pitch: 1.04 }, { at: 0.12, pitch: 0.98 }, { at: 0.24, pitch: 0.9 }, { at: 0.36, pitch: 0.86 }];

/** what the Rhino's feet should play this frame: a step, how high, and how loud */
export interface StepCue {
  id: SoundId;
  pitch: number;
  volume: number;
}

/**
 * The feet of every Rhino in the game, from frame to frame (pure, so it can be tested): it trots after its prey
 * and thunders when it charges, and the closer it is to a player on this screen, the louder; a charge coming
 * straight at you swells as it comes.
 */
export class RhinoSteps {
  private last = new Map<number, Vec2>();
  private stride = new Map<number, number>();

  frame(s: SimState, ids: readonly number[], live: boolean, dt: number): StepCue[] {
    const cues: StepCue[] = [];
    const rhinos = allBosses(s).filter(b => b.kind === 'rhino' && b.enemyId !== null).map(b => s.enemies.find(e => e.id === b.enemyId && e.hp > 0)).filter(e => e !== undefined);
    for (const id of [...this.last.keys()]) if (!rhinos.some(e => e.id === id)) { this.last.delete(id); this.stride.delete(id); }
    const ears = s.players.filter(p => ids.includes(p.id) && p.downUntil === null && !p.out);
    for (const e of rhinos) {
      const last = this.last.get(e.id);
      this.last.set(e.id, { ...e.pos });
      if (!live || !last || dt <= 0) continue;
      const speed = Math.hypot(e.pos.x - last.x, e.pos.z - last.z) / dt;
      // (standing, or a jump of its position: no steps, and the next one starts the stride afresh)
      if (speed < RHINO_STEPS.still || speed > 60) {
        this.stride.set(e.id, 0.999);
        continue;
      }
      let near = 0;
      for (const p of ears) near = Math.max(near, 1 - Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) / RHINO_STEPS.hear);
      const charging = e.state === 'charge';
      const at = this.stride.get(e.id) ?? 0.999;
      const next = at + (charging ? RHINO_STEPS.strides.charge : RHINO_STEPS.strides.walk) * dt;
      this.stride.set(e.id, next % 1);
      if (near <= 0) continue;
      // (it falls off slowly with the distance: a beast that size is heard across the arena)
      const volume = Math.min(1, near ** 1.4 * (charging ? RHINO_STEPS.charge : 1));
      for (const b of charging ? STAMPEDE : TROT) {
        const t = b.at < at % 1 ? b.at + 1 : b.at;
        if (t > at && t <= next) cues.push({ id: 'rhinoStep', pitch: b.pitch, volume });
      }
    }
    return cues;
  }
}
