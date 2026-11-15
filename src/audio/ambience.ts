import { HELIPAD } from '../sim/config/floor-helipad';
import type { Vec2 } from '../sim/types';

/** the sounds that go on and on while something is near: the helicopter's rotor on the Sky Helipad */
export type AmbienceId = 'rotor';

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
 * over it and a thump under it. Runs for as long as the context lives; `out` is turned up and down from outside.
 */
export function startAmbience(ctx: BaseAudioContext, id: AmbienceId, noise: AudioBuffer): GainNode {
  const out = ctx.createGain();
  out.gain.value = 0;
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
  return out;
}
