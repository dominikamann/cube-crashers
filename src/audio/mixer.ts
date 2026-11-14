import { JITTER, SOUNDS, type SoundId } from './sfx';
import { playSynth, soundDuration } from './synth';

export const MAX_VOICES_PER_SOUND = 4;
export const MIN_RESTART_SECONDS = 0.02;
/** how much of the music is left while the game is paused */
export const PAUSED_MUSIC = 0.35;

/** Keeps hundreds of hits per second from stacking into noise. Pure: times are passed in. */
export class VoiceLimiter {
  private voices = new Map<string, { start: number; end: number }[]>();

  tryStart(id: string, now: number, duration: number): boolean {
    const list = (this.voices.get(id) ?? []).filter(v => v.end > now);
    if (list.length >= MAX_VOICES_PER_SOUND) return false;
    if (list.some(v => now - v.start < MIN_RESTART_SECONDS)) return false;
    list.push({ start: now, end: now + duration });
    this.voices.set(id, list);
    return true;
  }

  reset(): void {
    this.voices.clear();
  }
}

export interface Mixer {
  play(id: SoundId, pitch?: number, bypassLimiter?: boolean): void;
  /** no new sounds while the window is hidden */
  setMuted(on: boolean): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  /** the music steps back while the game is paused */
  setPaused(on: boolean): void;
  /** every effect still ringing falls silent (the game was left): new ones play as before */
  cutEffects(): void;
  readonly musicBus: GainNode;
  readonly limiter: VoiceLimiter;
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5);
  }
  return curve;
}

export function createMixer(ctx: BaseAudioContext): Mixer {
  let sfxBus = ctx.createGain();
  const musicBus = ctx.createGain();
  let sfxVolume = 1, musicVolume = 1, paused = false;
  sfxBus.gain.value = 0.8;
  musicBus.gain.value = 0.5;
  const setMusic = () => musicBus.gain.setTargetAtTime(0.5 * musicVolume * (paused ? PAUSED_MUSIC : 1), ctx.currentTime, 0.08);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  // safety soft-clipper after the compressor: output can never exceed full scale
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();

  sfxBus.connect(comp);
  musicBus.connect(comp);
  comp.connect(clip).connect(ctx.destination);

  const limiter = new VoiceLimiter();
  let jitterSeed = 98765;

  let muted = false;
  return {
    setMuted(on) {
      muted = on;
    },
    play(id, pitch = 1, bypassLimiter = false) {
      // a hidden window is silent: sounds started now would all go off at once when it comes back
      if (muted) return;
      const layers = SOUNDS[id];
      const now = ctx.currentTime;
      if (!bypassLimiter && !limiter.tryStart(id, now, soundDuration(layers))) return;
      let p = pitch;
      if (JITTER.has(id)) {
        jitterSeed = (jitterSeed * 16807) % 2147483647;
        p *= 0.92 + (jitterSeed / 2147483647) * 0.16;
      }
      for (const layer of layers) playSynth(ctx, sfxBus, layer, now, p);
    },
    setMusicVolume(v) {
      musicVolume = v;
      setMusic();
    },
    setSfxVolume(v) {
      sfxVolume = v;
      sfxBus.gain.value = 0.8 * v;
    },
    setPaused(on) {
      paused = on;
      setMusic();
    },
    cutEffects() {
      // the old bus fades out with everything on it; a fresh one takes the effects from here on
      const old = sfxBus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => old.disconnect(), 400);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8 * sfxVolume;
      sfxBus.connect(comp);
      limiter.reset();
    },
    musicBus,
    limiter,
  };
}
