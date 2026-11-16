import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { SOUNDS } from '../../src/audio/sfx';
import { noiseBuffer, playSynth, soundDuration } from '../../src/audio/synth';
import { BossSteps, createEngineVoices, ENGINE, ENGINE_VOICES, ENGINES, GAITS, VehicleSound } from '../../src/audio/vehicle-sound';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim } from '../../src/sim/sim';
import { addVehicle, VEHICLES } from '../../src/sim/systems/vehicles';
import type { BossKind, VehicleKind } from '../../src/sim/types';

const DT = 1 / 60;

/** two players on a floor, the first one in a vehicle of this kind */
function ride(kind: VehicleKind = 'kart') {
  const s = createSim(FLOORS.floor01.map, 1, { players: 2 });
  const p = s.players[0];
  const v = addVehicle(s, kind, p.pos, 0);
  v.driverId = p.id;
  p.vehicleId = v.id;
  return { s, p, v };
}

/** runs the sound for a while and gathers what it plays */
function run(sound: VehicleSound, s: ReturnType<typeof ride>['s'], seconds: number, ids = [0]) {
  const cues: { id: string; pitch: number }[] = [];
  let last = sound.frame(s, ids, true, DT);
  cues.push(...last.cues);
  for (let i = 1; i < seconds * 60; i++) {
    last = sound.frame(s, ids, true, DT);
    cues.push(...last.cues);
  }
  return { cues, last };
}

describe('the engine of a vehicle', () => {
  it('idles while it stands and revs up with the speed, a little more with a boost', () => {
    const { s, p, v } = ride();
    const sound = new VehicleSound();
    const still = run(sound, s, 1).last.voices[0];
    expect(still.kind).toBe('kart');
    expect(still.level).toBeCloseTo(ENGINES.kart.level[0], 3);
    expect(still.rev).toBeCloseTo(0, 3);
    v.vel = { x: VEHICLES.kart.speed, z: 0 };
    const fast = run(sound, s, 2).last.voices[0];
    expect(fast.rev).toBeCloseTo(1, 2);
    expect(fast.level).toBeCloseTo(ENGINES.kart.level[1], 3);
    p.boostUntil = s.tick + 1000;
    expect(run(sound, s, 2).last.voices[0].rev).toBeCloseTo(1 + ENGINE.boost, 2);
  });

  it('revs up, it does not jump to full at once', () => {
    const { s, v } = ride();
    const sound = new VehicleSound();
    v.vel = { x: VEHICLES.kart.speed, z: 0 };
    const first = sound.frame(s, [0], true, DT).voices[0];
    expect(first.rev).toBeGreaterThan(0);
    expect(first.rev).toBeLessThan(0.2);
  });

  it('screams when the wheels leave the ground', () => {
    const { s, v } = ride();
    const sound = new VehicleSound();
    v.air = 20;
    expect(run(sound, s, 2).last.voices[0].rev).toBeCloseTo(ENGINE.airborne, 2);
  });

  it('each vehicle with an engine has a sound of its own; the unicorn has none', () => {
    for (const kind of ['kart', 'police', 'roller', 'hoverboard'] as const) {
      const { s } = ride(kind);
      expect(new VehicleSound().frame(s, [0], true, DT).voices[0].kind, kind).toBe(kind);
    }
    const { s } = ride('unicorn');
    expect(new VehicleSound().frame(s, [0], true, DT).voices.every(v => v.level === 0)).toBe(true);
  });

  it('is silent while the game is paused, in a menu or over, and when the driver gets out or goes down', () => {
    const { s, p, v } = ride();
    const sound = new VehicleSound();
    expect(sound.frame(s, [0], false, DT).voices[0].level).toBe(0);
    p.downUntil = s.tick + 100;
    expect(sound.frame(s, [0], true, DT).voices[0].level).toBe(0);
    p.downUntil = null;
    v.driverId = null;
    p.vehicleId = null;
    expect(sound.frame(s, [0], true, DT).voices[0].level).toBe(0);
  });

  it('split screen: each of the two players has a voice of their own', () => {
    const { s } = ride();
    const q = s.players[1];
    const w = addVehicle(s, 'roller', q.pos, 1);
    w.driverId = q.id;
    q.vehicleId = w.id;
    const voices = new VehicleSound().frame(s, [0, 1], true, DT).voices;
    expect(voices[0].kind).toBe('kart');
    expect(voices[1].kind).toBe('roller');
    expect(voices[ENGINE_VOICES - 1].level).toBe(0);
  });

  it('someone else\'s vehicle is heard only close by, and more quietly than one\'s own', () => {
    const { s, p, v } = ride();
    const sound = new VehicleSound();
    const mine = sound.frame(s, [0], true, DT).voices[0].level;
    // the second player listens: the first one drives right past them
    const q = s.players[1];
    q.pos = { ...v.pos };
    const near = sound.frame(s, [q.id], true, DT).voices;
    expect(near[0].level).toBe(0);
    expect(near[ENGINE_VOICES - 1].level).toBeGreaterThan(0);
    expect(near[ENGINE_VOICES - 1].level).toBeLessThan(mine);
    q.pos = { x: p.pos.x + ENGINE.hear + 1, z: p.pos.z };
    expect(sound.frame(s, [q.id], true, DT).voices[ENGINE_VOICES - 1].level).toBe(0);
  });
});

describe('the hooves of the unicorn', () => {
  it('are still while it stands, and in the air', () => {
    const { s, v } = ride('unicorn');
    const sound = new VehicleSound();
    expect(run(sound, s, 1).cues).toEqual([]);
    v.vel = { x: VEHICLES.unicorn.speed, z: 0 };
    v.air = 20;
    expect(run(sound, s, 1).cues).toEqual([]);
  });

  it('gallop at speed: three quick beats a stride, the last one the heaviest', () => {
    const { s, v } = ride('unicorn');
    const sound = new VehicleSound();
    v.vel = { x: VEHICLES.unicorn.speed, z: 0 };
    const { cues } = run(sound, s, 2);
    expect(cues.every(c => c.id === 'hoof')).toBe(true);
    // (2.6 strides a second, three beats each: about 15 in two seconds)
    expect(cues.length).toBeGreaterThanOrEqual(14);
    expect(cues.length).toBeLessThanOrEqual(17);
    expect(cues[0].pitch).toBeGreaterThan(cues[2].pitch);
    expect(cues[2].pitch).toBe(Math.min(...cues.map(c => c.pitch)));
  });

  it('walk slowly: four even steps a stride, the first one at once', () => {
    const { s, v } = ride('unicorn');
    const sound = new VehicleSound();
    v.vel = { x: VEHICLES.unicorn.speed * 0.2, z: 0 };
    expect(sound.frame(s, [0], true, DT).cues).toHaveLength(1);
    const { cues } = run(sound, s, 2);
    // (about 1.6 strides a second, four steps each)
    expect(cues.length).toBeGreaterThanOrEqual(11);
    expect(cues.length).toBeLessThanOrEqual(14);
  });

  it('someone else\'s unicorn is heard more softly, and only close by', () => {
    const { s, p, v } = ride('unicorn');
    const sound = new VehicleSound();
    v.vel = { x: VEHICLES.unicorn.speed, z: 0 };
    const q = s.players[1];
    q.pos = { ...p.pos };
    const near = run(sound, s, 1, [q.id]).cues;
    expect(near.length).toBeGreaterThan(0);
    expect(near.every(c => c.id === 'hoofFar')).toBe(true);
    q.pos = { x: p.pos.x + 30, z: p.pos.z };
    expect(run(sound, s, 1, [q.id]).cues).toEqual([]);
  });
});

async function render(play: (ctx: BaseAudioContext, dest: AudioNode) => void, seconds: number) {
  const rate = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  play(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  return { peak, data, rate };
}

describe('the sounds of the vehicles, rendered', () => {
  it('a hoof is a short knock, heard and never clipping; one further off is softer', async () => {
    const peaks: number[] = [];
    for (const id of ['hoof', 'hoofFar'] as const) {
      expect(soundDuration(SOUNDS[id]), id).toBeLessThan(0.15);
      const r = await render((ctx, dest) => SOUNDS[id].forEach(l => playSynth(ctx, dest, l, 0)), soundDuration(SOUNDS[id]) + 0.05);
      expect(r.peak, id).toBeLessThan(1);
      peaks.push(r.peak);
    }
    expect(peaks[0]).toBeGreaterThan(0.05);
    expect(peaks[1]).toBeLessThan(peaks[0]);
  });

  it('an engine at full speed is heard and stays far from clipping (it runs on under everything else)', async () => {
    for (const kind of Object.keys(ENGINES) as (keyof typeof ENGINES)[]) {
      const r = await render((ctx, dest) => {
        const v = createEngineVoices(ctx, dest, noiseBuffer(ctx));
        v.set([{ kind, level: ENGINES[kind].level[1], rev: 1 }, { kind: null, level: 0, rev: 0 }, { kind: null, level: 0, rev: 0 }]);
      }, 1);
      const tail = r.data.slice(Math.floor(r.rate * 0.6));
      let peak = 0;
      for (const x of tail) peak = Math.max(peak, Math.abs(x));
      expect(peak, kind).toBeGreaterThan(0.005);
      expect(peak, kind).toBeLessThan(0.3);
    }
  });
});

describe('the feet of the big bosses', () => {
  async function arena(kind: BossKind = 'rhino') {
    const { spawnBoss } = await import('../../src/sim/systems/boss');
    const s = createSim(FLOORS.arena.map, 1, { mode: 'quick' });
    s.enemies = [];
    s.boss = null;
    const p = s.players[0];
    spawnBoss(s, kind, { x: p.pos.x, z: p.pos.z - 20 });
    const body = s.enemies.find(e => e.id === s.boss!.enemyId)!;
    return { s, p, body };
  }
  type Arena = Awaited<ReturnType<typeof arena>>;
  /** moves the boss toward the player for a while at this speed, and gathers its steps */
  function walk(steps: BossSteps, { s, body }: Arena, speed: number, seconds: number, live = true) {
    const cues: { id: string; pitch: number; volume: number }[] = [];
    for (let i = 0; i < seconds * 60; i++) {
      body.pos.z += speed * DT;
      cues.push(...steps.frame(s, [0], live, DT));
    }
    return cues;
  }

  it('the Rhino trots after you, and gets louder as it comes closer', async () => {
    const a = await arena();
    const cues = walk(new BossSteps(), a, 4, 4);
    expect(cues.length).toBeGreaterThanOrEqual(12);
    expect(cues.every(c => c.id === 'bigStep')).toBe(true);
    expect(cues[cues.length - 1].volume).toBeGreaterThan(cues[0].volume * 2);
  });

  it('the Rhino thunders in a charge: more steps, and louder than a trot just as close', async () => {
    const a = await arena();
    const steps = new BossSteps();
    const trot = walk(steps, a, 1, 1);
    a.body.state = 'charge';
    const charge = walk(steps, a, 1, 1);
    expect(charge.length).toBeGreaterThan(trot.length * 2);
    expect(Math.max(...charge.map(c => c.volume))).toBeGreaterThan(Math.max(...trot.map(c => c.volume)));
  });

  it('every big boss that walks is heard walking, each in its own way', async () => {
    const heard = new Map<string, { id: string; pitch: number }>();
    for (const kind of ['rhino', 'rex', 'spider', 'dominik'] as BossKind[]) {
      const cues = walk(new BossSteps(), await arena(kind), 2, 2);
      expect(cues.length, kind).toBeGreaterThan(0);
      heard.set(kind, cues[0]);
    }
    // hooves, a giant's feet, eight legs, boots: each its own sound
    expect([...heard.values()].map(c => c.id)).toEqual(['bigStep', 'rexStomp', 'skitter', 'bootStep']);
    // the spider's eight legs patter: far more steps than the Rhino trots at the same pace
    const a = await arena('spider'), b = await arena('rhino');
    expect(walk(new BossSteps(), a, 2, 2).length).toBeGreaterThan(walk(new BossSteps(), b, 2, 2).length);
  });

  it('the Mega Block does not walk: no steps from it', async () => {
    expect(walk(new BossSteps(), await arena('megaBlock'), 2, 2)).toEqual([]);
  });

  it('in a LAN game, where it moves only every other frame, it steps just as often', async () => {
    const here = walk(new BossSteps(), await arena(), 4, 4);
    const a = await arena();
    const steps = new BossSteps();
    const lan: typeof here = [];
    for (let i = 0; i < 4 * 60; i++) {
      if (i % 2 === 0) a.body.pos.z += 4 * DT * 2;
      lan.push(...steps.frame(a.s, [0], true, DT));
    }
    expect(Math.abs(lan.length - here.length)).toBeLessThanOrEqual(2);
  });

  it('is still while it stands, far off, or while the game is not played', async () => {
    const a = await arena();
    expect(walk(new BossSteps(), a, 0, 1)).toEqual([]);
    a.body.pos.z -= GAITS.rhino!.hear + 10;
    expect(walk(new BossSteps(), a, 3, 1)).toEqual([]);
    expect(walk(new BossSteps(), await arena(), 4, 1, false)).toEqual([]);
  });

  it('a step is short, heard and never clips', async () => {
    for (const id of ['bigStep', 'rexStomp', 'skitter', 'bootStep'] as const) {
      expect(soundDuration(SOUNDS[id]), id).toBeLessThan(0.45);
      const r = await render((ctx, dest) => SOUNDS[id].forEach(l => playSynth(ctx, dest, l, 0)), soundDuration(SOUNDS[id]) + 0.05);
      expect(r.peak, id).toBeGreaterThan(0.05);
      expect(r.peak, id).toBeLessThan(1);
    }
  });
});
