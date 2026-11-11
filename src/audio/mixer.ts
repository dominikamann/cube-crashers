import { JITTER, SOUNDS, type SoundId } from './sfx';
import { playSynth, soundDuration } from './synth';

export const MAX_VOICES_PER_SOUND = 4;
export const MIN_RESTART_SECONDS = 0.02;

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
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
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
  const sfxBus = ctx.createGain();
  const musicBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  musicBus.gain.value = 0.5;

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

  return {
    play(id, pitch = 1, bypassLimiter = false) {
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
      musicBus.gain.value = 0.5 * v;
    },
    setSfxVolume(v) {
      sfxBus.gain.value = 0.8 * v;
    },
    musicBus,
    limiter,
  };
}
