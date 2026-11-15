import { HELIPAD } from '../sim/config/floor-helipad';
import type { Vec2 } from '../sim/types';

/**
 * the sounds that go on and on while something is near or something is on: the helicopter's rotor on the Sky
 * Helipad; in the Glitch Maze the wailing siren of the hunting ghosts, and the wobble while they flee
 */
export type AmbienceId = 'rotor' | 'mazeSiren' | 'mazeScared';

/** a sound that goes on and on: `out` is turned up and down from outside; `speed` (0 to 1) drives it harder */
export interface Ambience {
  out: GainNode;
  speed?(k: number, at: number): void;
}

/**
 * The Glitch Maze for the players on this screen: how loud the siren and the wobble are, and how hard the siren
 * goes (0 to 1: the fewer pixels are left, the faster it wails). Nothing outside the maze.
 */
export function mazeAmbience(s: { tick: number; phase: string; run: { stage: string; maze?: { pixels: unknown[]; total: number; powerUntil: number } | null } }): { siren: number; scared: number; speed: number } {
  const maze = s.run.maze;
  if (s.run.stage !== 'maze' || s.phase !== 'playing' || !maze) return { siren: 0, scared: 0, speed: 0 };
  const scared = s.tick < maze.powerUntil;
  return { siren: scared ? 0 : 1, scared: scared ? 1 : 0, speed: maze.total > 0 ? 1 - maze.pixels.length / maze.total : 0 };
}

/** this close to the helicopter the rotor is at its loudest, and from this far it is not heard any more */
export const ROTOR_NEAR = 5;
export const ROTOR_FAR = 36;

/**
 * How loud the helicopter's rotor is for the players on this screen (0 silent, 1 full): by the nearest of them
 * to the middle of the pad, falling off with the distance; nothing anywhere but on the helipad.
 */
export function rotorLoudness(mapId: string, ears: Vec2[]): number {
  if (mapId !== 'helipad' || ears.length === 0) return 0;
  const { pad } = HELIPAD;
  const d = Math.min(...ears.map(e => Math.hypot(e.x - pad.x, e.z - pad.z)));
  const k = Math.min(1, Math.max(0, 1 - (d - ROTOR_NEAR) / (ROTOR_FAR - ROTOR_NEAR)));
  return k * k;
}

/**
 * The rotor as sound: a deep rush of air that the blades chop (noise under a low filter, its loudness beaten by
 * a slow oscillator as fast as the four blades go past, see the rotor's speed in decor.ts), the turbine's whine
 * over it and a thump under it. The maze's siren: a tone that wails up and down, faster and higher as the maze
 * empties; its wobble: a quick warble while the ghosts flee. Each runs for as long as the context lives.
 */
export function startAmbience(ctx: BaseAudioContext, id: AmbienceId, noise: AudioBuffer): Ambience {
  const out = ctx.createGain();
  out.gain.value = 0;
  if (id === 'mazeSiren' || id === 'mazeScared') {
    const scared = id === 'mazeScared';
    // a tone whose pitch an oscillator swings up and down: slow and wide for the siren, quick and narrow (and
    // only upward, a saw) for the wobble
    const tone = ctx.createOscillator();
    tone.type = scared ? 'square' : 'triangle';
    tone.frequency.value = scared ? 260 : 380;
    const swing = ctx.createOscillator();
    swing.type = scared ? 'sawtooth' : 'sine';
    swing.frequency.value = scared ? 10 : 2.2;
    const depth = ctx.createGain();
    depth.gain.value = scared ? 150 : 170;
    swing.connect(depth).connect(tone.frequency);
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = scared ? 1200 : 1800;
    const level = ctx.createGain();
    level.gain.value = scared ? 0.03 : 0.045;
    tone.connect(soft).connect(level).connect(out);
    tone.start();
    swing.start();
    return {
      out,
      speed: scared
        ? undefined
        : (k, at) => {
            // the fewer pixels are left, the faster and higher it wails
            swing.frequency.setTargetAtTime(2.2 + 2.6 * k, at, 0.4);
            tone.frequency.setTargetAtTime(380 + 140 * k, at, 0.4);
          },
    };
  }
  if (id === 'rotor') {
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 15;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(chop.gain);
    const rush = ctx.createBufferSource();
    rush.buffer = noise;
    rush.loop = true;
    rush.playbackRate.value = 0.5;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    rush.connect(low).connect(chop).connect(out);
    const thump = ctx.createOscillator();
    thump.frequency.value = 58;
    const thumpGain = ctx.createGain();
    thumpGain.gain.value = 0.22;
    thump.connect(thumpGain).connect(chop);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 190;
    const whineLow = ctx.createBiquadFilter();
    whineLow.type = 'lowpass';
    whineLow.frequency.value = 900;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.045;
    whine.connect(whineLow).connect(whineGain).connect(out);
    for (const src of [rush, lfo, thump, whine]) src.start();
  }
  return { out };
}
