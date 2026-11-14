import { midiToFreq, playSynth, type SynthParams } from './synth';

/**
 * Chiptune step sequencer: 16 steps (16th notes) per pattern, four channels.
 * Notes are written as "C4", "D#5", "." for rest, "-" to hold the previous note.
 * Drums: "k" kick, "s" snare, "h" hi-hat, "o" open hat, "c" clap, "." rest; several at once are written
 * together ("kc"). All compositions are original.
 */
export type TrackId = 'menu' | 'battle' | 'boss' | 'disco';

interface Pattern {
  lead: string;
  harm: string;
  bass: string;
  drums: string;
  /** more voices that sound with `harm`: the other notes of a chord */
  chord?: string[];
}

interface Track {
  bpm: number;
  patterns: Pattern[];
  order: number[];
  leadVol: number;
  /** house: the chords are short saw stabs and the bass is a filtered saw (it rests on the kick, so it pumps) */
  house?: boolean;
}

const TRACKS: Record<TrackId, Track> = {
  menu: {
    bpm: 100,
    leadVol: 0.06,
    patterns: [
      {
        lead: 'E5 - G5 - C6 - B5 - G5 - - - E5 - D5 -',
        harm: 'C5 . . . E5 . . . D5 . . . B4 . . .',
        bass: 'C3 . . . C3 . G2 . F2 . . . G2 . . .',
        drums: 'k . h . s . h . k . h . s . h h',
      },
      {
        lead: 'C5 - E5 - A5 - G5 - F5 - E5 - D5 - - -',
        harm: 'A4 . . . C5 . . . A4 . . . B4 . . .',
        bass: 'A2 . . . A2 . E2 . F2 . . . G2 . G2 .',
        drums: 'k . h . s . h . k . h k s . h .',
      },
    ],
    order: [0, 1, 0, 1],
  },
  battle: {
    bpm: 140,
    leadVol: 0.055,
    patterns: [
      {
        lead: 'A4 . C5 . E5 . A5 . G5 . E5 . D5 . E5 .',
        harm: 'E4 . . . A4 . . . G4 . . . A4 . . .',
        bass: 'A2 A2 A3 A2 A2 A2 A3 A2 G2 G2 G3 G2 G2 G2 G3 G2',
        drums: 'k h s h k k s h k h s h k k s s',
      },
      {
        lead: 'F5 . E5 . C5 . A4 . B4 . C5 . D5 - E5 -',
        harm: 'C5 . . . A4 . . . G4 . . . B4 . . .',
        bass: 'F2 F2 F3 F2 F2 F2 F3 F2 E2 E2 E3 E2 E2 E2 E3 E2',
        drums: 'k h s h k k s h k h s h k s s s',
      },
      {
        lead: 'A5 . G5 A5 . E5 . C5 D5 . E5 . G5 . A5 -',
        harm: 'E5 . . . C5 . . . B4 . . . E5 . . .',
        bass: 'A2 A2 A3 A2 C3 C3 C4 C3 D3 D3 D4 D3 E3 E3 E4 E3',
        drums: 'k h s h k h s h k h s h k k s h',
      },
    ],
    order: [0, 1, 0, 2],
  },
  boss: {
    bpm: 160,
    leadVol: 0.05,
    patterns: [
      {
        lead: 'D5 D5 . F5 . D5 G#5 . A5 . G#5 F5 . D5 . C5',
        harm: 'A4 . . . A4 . . . D5 . . . C5 . . .',
        bass: 'D2 D2 D3 D2 D2 D3 D2 D2 A#1 A#1 A#2 A#1 C2 C2 C3 C2',
        drums: 'k k s h k k s k k k s h k s s s',
      },
      {
        lead: 'A5 - G5 - F5 - E5 - F5 . E5 . C#5 - - -',
        harm: 'F5 . . . D5 . . . D5 . . . A4 . . .',
        bass: 'D2 D3 D2 D3 F2 F3 F2 F3 G2 G3 G2 G3 A2 A3 A2 A3',
        drums: 'k h s k k h s k k h s k s s s s',
      },
    ],
    order: [0, 0, 1, 0, 1],
  },
  // what plays while a Disco Ball is in the air: house in A minor (Am, F, C, G), four on the floor, the open
  // hat off the beat, a clap on 2 and 4. It starts with its hook: a ball is only up for two bars
  disco: {
    bpm: 126,
    leadVol: 0.05,
    house: true,
    patterns: [
      {
        lead: 'A5 . . . . . G5 . A5 . . . C6 . A5 .',
        harm: 'E5 . . E5 . . E5 . . . E5 . . E5 . .',
        chord: ['C5 . . C5 . . C5 . . . C5 . . C5 . .', 'A4 . . A4 . . A4 . . . A4 . . A4 . .'],
        bass: '. . A2 A2 . . A2 A2 . . A2 A2 . . A2 A3',
        drums: 'k h o h kc h o h k h o h kc h o h',
      },
      {
        lead: 'A5 . . . . . G5 . F5 . . . A5 . C6 .',
        harm: 'F5 . . F5 . . F5 . . . F5 . . F5 . .',
        chord: ['C5 . . C5 . . C5 . . . C5 . . C5 . .', 'A4 . . A4 . . A4 . . . A4 . . A4 . .'],
        bass: '. . F2 F2 . . F2 F2 . . F2 F2 . . F2 F3',
        drums: 'k h o h kc h o h k h o h kc h o o',
      },
      {
        lead: 'G5 . . . . . E5 . G5 . . . C6 . G5 .',
        harm: 'E5 . . E5 . . E5 . . . E5 . . E5 . .',
        chord: ['C5 . . C5 . . C5 . . . C5 . . C5 . .', 'G4 . . G4 . . G4 . . . G4 . . G4 . .'],
        bass: '. . C3 C3 . . C3 C3 . . C3 C3 . . C3 C4',
        drums: 'k h o h kc h o h k h o h kc h o h',
      },
      {
        lead: 'D5 . . . G5 . . . B5 . A5 . G5 . D5 .',
        harm: 'D5 . . D5 . . D5 . . . D5 . . D5 . .',
        chord: ['B4 . . B4 . . B4 . . . B4 . . B4 . .', 'G4 . . G4 . . G4 . . . G4 . . G4 . .'],
        bass: '. . G2 G2 . . G2 G2 . . G2 G2 . . G2 G3',
        drums: 'k h o h kc h o h k h o h kc h c c',
      },
    ],
    order: [0, 1, 2, 3],
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** "A#4" → MIDI 70; "." → null; "-" → 'hold'. */
export function parseNote(token: string): number | null | 'hold' {
  if (token === '.') return null;
  if (token === '-') return 'hold';
  const m = /^([A-G]#?)(\d)$/.exec(token);
  if (!m) throw new Error(`bad note ${token}`);
  return 12 * (Number(m[2]) + 1) + NOTE_INDEX[m[1]];
}

export function parseLine(line: string): (number | null | 'hold')[] {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length !== 16) throw new Error(`pattern needs 16 steps, got ${tokens.length}: ${line}`);
  return tokens.map(parseNote);
}

/** Number of consecutive steps a note at `i` lasts (itself plus following holds). */
function noteLength(steps: (number | null | 'hold')[], i: number): number {
  let n = 1;
  while (i + n < steps.length && steps[i + n] === 'hold') n++;
  return n;
}

function drum(ctx: BaseAudioContext, dest: AudioNode, kind: string, when: number): void {
  const voices: Record<string, SynthParams[]> = {
    k: [{ wave: 'sine', freq: 150, freqEnd: 40, attack: 0.001, sustain: 0.02, decay: 0.15, volume: 0.5 }],
    s: [
      { wave: 'noise', freq: 1500, attack: 0.001, sustain: 0.02, decay: 0.1, volume: 0.18, lowpass: 5000 },
      { wave: 'triangle', freq: 220, freqEnd: 140, attack: 0.001, sustain: 0.01, decay: 0.06, volume: 0.12 },
    ],
    h: [{ wave: 'noise', freq: 3000, attack: 0.001, sustain: 0.005, decay: 0.03, volume: 0.05 }],
    // an open hat rings on, a clap is two short bursts of noise right after each other
    o: [{ wave: 'noise', freq: 3400, attack: 0.001, sustain: 0.03, decay: 0.13, volume: 0.045 }],
    c: [
      { wave: 'noise', freq: 1100, attack: 0.001, sustain: 0.006, decay: 0.02, volume: 0.13, lowpass: 3800 },
      { wave: 'noise', freq: 1200, attack: 0.001, sustain: 0.015, decay: 0.11, volume: 0.16, lowpass: 3800, at: 0.014 },
    ],
  };
  // (a step may hold several drums at once: "kc")
  for (const one of kind) for (const v of voices[one] ?? []) playSynth(ctx, dest, v, when);
}

/** Skips steps whose time has already passed (timer throttled while the window was hidden). */
export function catchUp(step: number, nextTime: number, now: number, stepDur: number): { step: number; nextTime: number } {
  if (nextTime >= now) return { step, nextTime };
  const missed = Math.ceil((now - nextTime) / stepDur - 1e-9);
  return { step: step + missed, nextTime: nextTime + missed * stepDur };
}

export interface MusicPlayer {
  /** (`fade`: seconds of crossfade into it, when it should be there sooner than usual) */
  playTrack(id: TrackId | null, fade?: number): void;
  current(): TrackId | null;
  stop(): void;
}

const LOOKAHEAD_MS = 25;
const HORIZON_S = 0.1;
const CROSSFADE_S = 1;
/** a Disco Ball's track lands at once: the ball is not up for long */
export const DISCO_FADE_S = 0.15;
/** the track keeps going this long after a ball is gone: one thrown right after the last does not start it anew */
export const DISCO_TAIL_S = 0.6;
/** how far a Disco Ball is heard, in tiles */
export const DISCO_EARSHOT = 16;

/**
 * What should play: the track the game asks for (the menu, the battle, the boss, or nothing), unless a Disco
 * Ball is in the air during a game: then its own track, until `discoUntil`.
 */
export function trackToPlay(base: TrackId | null, discoUntil: number, now: number): TrackId | null {
  return (base === 'battle' || base === 'boss') && now < discoUntil ? 'disco' : base;
}

/** Whether a Disco Ball that went off at `at` is heard by one of the `listeners` (the players on this screen); with none, by everyone. */
export function discoHeard(at: { x: number; z: number }, listeners: { x: number; z: number }[]): boolean {
  return listeners.length === 0 || listeners.some(l => Math.hypot(l.x - at.x, l.z - at.z) <= DISCO_EARSHOT);
}

export function createMusic(ctx: AudioContext, out: AudioNode): MusicPlayer {
  const parsed = new Map<TrackId, { lead: ReturnType<typeof parseLine>; harm: ReturnType<typeof parseLine>; chord: ReturnType<typeof parseLine>[]; bass: ReturnType<typeof parseLine>; drums: string[] }[]>();
  for (const [id, t] of Object.entries(TRACKS) as [TrackId, Track][]) {
    parsed.set(
      id,
      t.patterns.map(p => ({
        lead: parseLine(p.lead),
        harm: parseLine(p.harm),
        chord: (p.chord ?? []).map(parseLine),
        bass: parseLine(p.bass),
        drums: p.drums.trim().split(/\s+/),
      })),
    );
  }

  let trackId: TrackId | null = null;
  let bus: GainNode | null = null;
  let step = 0;
  let nextTime = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function schedule() {
    if (!trackId || !bus) return;
    const t = TRACKS[trackId];
    const pats = parsed.get(trackId)!;
    const stepDur = 60 / t.bpm / 4;
    ({ step, nextTime } = catchUp(step, nextTime, ctx.currentTime, stepDur));
    while (nextTime < ctx.currentTime + HORIZON_S) {
      const totalSteps = t.order.length * 16;
      const s = step % totalSteps;
      const p = pats[t.order[Math.floor(s / 16)]];
      const i = s % 16;
      const lead = p.lead[i], bass = p.bass[i];
      if (typeof lead === 'number') {
        const len = noteLength(p.lead, i) * stepDur;
        playSynth(ctx, bus, { wave: 'square', freq: midiToFreq(lead), attack: 0.005, sustain: len * 0.7, decay: len * 0.3, volume: t.leadVol, lowpass: 3500 }, nextTime);
      }
      for (const line of [p.harm, ...p.chord]) {
        const note = line[i];
        if (typeof note !== 'number') continue;
        if (t.house) {
          const len = noteLength(line, i) * stepDur * 1.6;
          playSynth(ctx, bus, { wave: 'sawtooth', freq: midiToFreq(note), attack: 0.004, sustain: len * 0.35, decay: len * 0.65, volume: t.leadVol * 0.5, lowpass: 2600 }, nextTime);
          continue;
        }
        const len = noteLength(line, i) * stepDur * 3;
        playSynth(ctx, bus, { wave: 'square', freq: midiToFreq(note), attack: 0.01, sustain: len * 0.5, decay: len * 0.5, volume: t.leadVol * 0.45, lowpass: 2000 }, nextTime);
      }
      if (typeof bass === 'number') {
        if (t.house) playSynth(ctx, bus, { wave: 'sawtooth', freq: midiToFreq(bass), attack: 0.004, sustain: stepDur * 0.6, decay: stepDur * 0.35, volume: 0.2, lowpass: 700 }, nextTime);
        else playSynth(ctx, bus, { wave: 'triangle', freq: midiToFreq(bass), attack: 0.003, sustain: stepDur * 0.7, decay: stepDur * 0.3, volume: 0.22 }, nextTime);
      }
      drum(ctx, bus, p.drums[i], nextTime);
      nextTime += stepDur;
      step++;
    }
  }

  function fadeOut(g: GainNode, fade = CROSSFADE_S) {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => g.disconnect(), fade * 1000 + 200);
  }

  return {
    playTrack(id, fade = CROSSFADE_S) {
      if (id === trackId) return;
      if (bus) fadeOut(bus, fade);
      trackId = id;
      bus = null;
      if (!id) return;
      bus = ctx.createGain();
      bus.gain.setValueAtTime(0, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
      bus.connect(out);
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      if (!timer) timer = setInterval(schedule, LOOKAHEAD_MS);
    },
    current: () => trackId,
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (bus) fadeOut(bus);
      bus = null;
      trackId = null;
    },
  };
}

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];
export const trackPatterns = (id: TrackId) => TRACKS[id].patterns;
