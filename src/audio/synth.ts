/** sfxr-style synth voice: one oscillator (or noise) with an envelope, optional sweep, vibrato, lowpass. */
export interface SynthParams {
  wave: 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise';
  freq: number;
  /** pitch sweep target (exponential ramp) */
  freqEnd?: number;
  attack: number;
  sustain: number;
  decay: number;
  volume: number;
  vibrato?: { rate: number; depth: number };
  lowpass?: number;
  /** start offset within a layered sound, seconds */
  at?: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

export function voiceDuration(p: SynthParams): number {
  return (p.at ?? 0) + p.attack + p.sustain + p.decay;
}

export function soundDuration(layers: SynthParams[]): number {
  return Math.max(...layers.map(voiceDuration));
}

export function playSynth(ctx: BaseAudioContext, dest: AudioNode, p: SynthParams, when: number, pitchMul = 1): void {
  const t0 = when + (p.at ?? 0);
  const end = t0 + p.attack + p.sustain + p.decay;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(p.volume, t0 + p.attack);
  gain.gain.setValueAtTime(p.volume, t0 + p.attack + p.sustain);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  let out: AudioNode = gain;
  if (p.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = p.lowpass;
    gain.connect(f);
    out = f;
  }
  out.connect(dest);

  if (p.wave === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    src.playbackRate.value = pitchMul * (p.freq / 1000);
    src.connect(gain);
    src.start(t0);
    src.stop(end + 0.01);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = p.wave;
  osc.frequency.setValueAtTime(p.freq * pitchMul, t0);
  if (p.freqEnd) osc.frequency.exponentialRampToValueAtTime(p.freqEnd * pitchMul, end);
  if (p.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = p.vibrato.rate;
    depth.gain.value = p.vibrato.depth * pitchMul;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(end + 0.01);
  }
  osc.connect(gain);
  osc.start(t0);
  osc.stop(end + 0.01);
}

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
