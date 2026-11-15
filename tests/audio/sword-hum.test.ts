import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { SOUNDS, soundsForEvent, swordClashes } from '../../src/audio/sfx';
import { createHumVoices, HUM, HUM_VOICES, SwordHum, swordDrawn } from '../../src/audio/sword-hum';
import { playSynth, soundDuration } from '../../src/audio/synth';
import { FLOORS } from '../../src/sim/config/floors';
import { createSim } from '../../src/sim/sim';
import type { SimEvent } from '../../src/sim/types';

const DT = 1 / 60;

/** two players on a floor, the first with a sword and a blaster, the sword in hand */
function game(players = 2) {
  const s = createSim(FLOORS.floor01.map, 1, { players });
  for (const p of s.players) {
    p.weapons = [{ kind: 'pixelBlaster', level: 1, cooldown: 0 }, { kind: 'laserSword', level: 1, cooldown: 0 }];
    p.selected = 0;
  }
  s.players[0].selected = 1;
  return s;
}

describe('a drawn sword', () => {
  it('is in the hand of a player who is up, on foot, with the sword selected and no rare weapon out', () => {
    const s = game();
    const p = s.players[0];
    expect(swordDrawn(p)).toBe(true);
    expect(swordDrawn(s.players[1])).toBe(false);
    expect(swordDrawn({ ...p, downUntil: 10 })).toBe(false);
    expect(swordDrawn({ ...p, out: true })).toBe(false);
    expect(swordDrawn({ ...p, vehicleId: 3 })).toBe(false);
    expect(swordDrawn({ ...p, rare: { kind: 'slushMachine', ammo: 5, cooldown: 0 } as never, rareSelected: true })).toBe(false);
  });
});

describe('the hum of the sword', () => {
  it('lights with the sword drawn, hums while it is in the hand, and goes out when another weapon is taken', () => {
    const s = game();
    const hum = new SwordHum();
    const first = hum.frame(s, [0], true, DT);
    expect(first.cues).toEqual(['swordOn']);
    expect(first.voices[0].level).toBeGreaterThan(0);
    const steady = hum.frame(s, [0], true, DT);
    expect(steady.cues).toEqual([]);
    expect(steady.voices[0].level).toBeCloseTo(HUM.level, 3);
    s.players[0].selected = 0;
    const away = hum.frame(s, [0], true, DT);
    expect(away.cues).toEqual(['swordOff']);
    expect(away.voices[0].level).toBe(0);
    s.players[0].selected = 1;
    expect(hum.frame(s, [0], true, DT).cues).toEqual(['swordOn']);
  });

  it('is silent while the game is paused, in a menu, over or in the kill cam, and does not light again when it comes back', () => {
    const s = game();
    const hum = new SwordHum();
    hum.frame(s, [0], true, DT);
    const paused = hum.frame(s, [0], false, DT);
    expect(paused.voices.every(v => v.level === 0)).toBe(true);
    expect(paused.cues).toEqual([]);
    const back = hum.frame(s, [0], true, DT);
    expect(back.cues).toEqual([]);
    expect(back.voices[0].level).toBeGreaterThan(0);
  });

  it('stops when its player goes down, without the sound of putting it away, and lights again when they are back', () => {
    const s = game();
    const hum = new SwordHum();
    hum.frame(s, [0], true, DT);
    s.players[0].downUntil = s.tick + 100;
    const down = hum.frame(s, [0], true, DT);
    expect(down.cues).toEqual([]);
    expect(down.voices[0].level).toBe(0);
    s.players[0].downUntil = null;
    expect(hum.frame(s, [0], true, DT).cues).toEqual(['swordOn']);
  });

  it('goes out when its player gets into a vehicle', () => {
    const s = game();
    const hum = new SwordHum();
    hum.frame(s, [0], true, DT);
    s.players[0].vehicleId = 7;
    const car = hum.frame(s, [0], true, DT);
    expect(car.cues).toEqual(['swordOff']);
    expect(car.voices[0].level).toBe(0);
  });

  it('is gone when the player has left the game', () => {
    const s = game();
    const hum = new SwordHum();
    hum.frame(s, [0], true, DT);
    s.players = s.players.filter(p => p.id !== 0);
    const gone = hum.frame(s, [0], true, DT);
    expect(gone.voices.every(v => v.level === 0)).toBe(true);
    expect(gone.cues).toEqual([]);
  });

  it('split screen: each of the two players has a voice of their own', () => {
    const s = game();
    const hum = new SwordHum();
    s.players[1].selected = 1;
    const both = hum.frame(s, [0, 1], true, DT);
    expect(both.cues).toEqual(['swordOn', 'swordOn']);
    expect(both.voices[0].level).toBeGreaterThan(0);
    expect(both.voices[1].level).toBeGreaterThan(0);
    // (a player on this screen is never heard as someone else as well)
    expect(both.voices[HUM_VOICES - 1].level).toBe(0);
    s.players[1].selected = 0;
    const one = hum.frame(s, [0, 1], true, DT);
    expect(one.voices[1].level).toBe(0);
    expect(one.voices[0].level).toBeGreaterThan(0);
  });

  it('someone else\'s sword is heard only close by, and more quietly than one\'s own', () => {
    const s = game();
    const hum = new SwordHum();
    const [me, other] = s.players;
    me.selected = 0;
    other.selected = 1;
    other.pos = { x: me.pos.x + 1, z: me.pos.z };
    const near = hum.frame(s, [me.id], true, DT);
    expect(near.cues).toEqual([]);
    expect(near.voices[HUM_VOICES - 1].level).toBeGreaterThan(0);
    expect(near.voices[HUM_VOICES - 1].level).toBeLessThan(HUM.level * HUM.others);
    other.pos = { x: me.pos.x + HUM.hear + 1, z: me.pos.z };
    expect(hum.frame(s, [me.id], true, DT).voices[HUM_VOICES - 1].level).toBe(0);
    other.pos = { x: me.pos.x + 1, z: me.pos.z };
    expect(hum.frame(s, [me.id], false, DT).voices[HUM_VOICES - 1].level).toBe(0);
  });

  it('swells and climbs a little while the player turns with it, and settles again', () => {
    const s = game();
    const hum = new SwordHum();
    const p = s.players[0];
    let rest = hum.frame(s, [0], true, DT).voices[0];
    for (let i = 0; i < 30; i++) rest = hum.frame(s, [0], true, DT).voices[0];
    let turning = rest;
    for (let i = 0; i < 20; i++) {
      const a = i * 0.08;
      p.aim = { x: Math.sin(a), z: Math.cos(a) };
      turning = hum.frame(s, [0], true, DT).voices[0];
    }
    expect(turning.pitch).toBeGreaterThan(rest.pitch);
    expect(turning.level).toBeGreaterThan(rest.level);
    expect(turning.pitch).toBeLessThanOrEqual(1 + HUM.rise);
    let still = turning;
    for (let i = 0; i < 90; i++) still = hum.frame(s, [0], true, DT).voices[0];
    expect(still.pitch).toBeCloseTo(1, 2);
  });
});

describe('the clash of the sword', () => {
  const swing: SimEvent = { type: 'shot', weapon: 'laserSword', pos: { x: 10, z: 10 }, playerId: 0 };

  it('rings when a swing hit something close to it, once a swing', () => {
    expect(swordClashes([swing])).toEqual([]);
    const hit: SimEvent = { type: 'enemyHit', id: 1, pos: { x: 11.5, z: 10 }, amount: 5 };
    const clash = swordClashes([swing, hit, { ...hit, id: 2 }]);
    expect(clash).toHaveLength(1);
    expect(clash[0].id).toBe('swordClash');
    // (far off, it was something else's hit)
    expect(swordClashes([swing, { ...hit, pos: { x: 30, z: 10 } }])).toEqual([]);
    // (another weapon's shot does not clash)
    expect(swordClashes([{ ...swing, weapon: 'flySwatter' }, hit])).toEqual([]);
  });

  it('on a rival only when the swinger dealt the hit', () => {
    const mine: SimEvent = { type: 'playerHit', playerId: 1, hp: 50, pos: { x: 11, z: 10 }, amount: 10, by: 0 };
    expect(swordClashes([swing, mine])).toHaveLength(1);
    expect(swordClashes([swing, { ...mine, by: 2 }])).toEqual([]);
  });

  it('is its own sound, apart from the swing', () => {
    expect(soundsForEvent(swing)[0].id).toBe('shot_laserSword');
    expect(SOUNDS.swordClash).not.toBe(SOUNDS.shot_laserSword);
  });
});

/** a sound rendered offline: its peak, and how loud it is on average where it sounds (RMS over its length) */
async function render(play: (ctx: BaseAudioContext, dest: AudioNode) => void, seconds: number) {
  const rate = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  play(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of data) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / data.length), data, rate };
}

const sound = (id: keyof typeof SOUNDS) => render((ctx, dest) => SOUNDS[id].forEach(l => playSynth(ctx, dest, l, 0)), soundDuration(SOUNDS[id]) + 0.05);

describe('the sounds of the sword, rendered', () => {
  it('swing, clash, lighting and going out are short, heard and never clip', async () => {
    for (const id of ['shot_laserSword', 'swordClash', 'swordOn', 'swordOff'] as const) {
      expect(soundDuration(SOUNDS[id]), id).toBeLessThan(0.5);
      const r = await sound(id);
      expect(r.peak, id).toBeGreaterThan(0.05);
      expect(r.peak, id).toBeLessThan(1);
    }
  });

  it('the hum is far quieter than the swing, and a low sound', async () => {
    const swing = await sound('shot_laserSword');
    const hum = await render((ctx, dest) => {
      const v = createHumVoices(ctx, dest);
      v.set([{ level: HUM.level, pitch: 1 }, { level: 0, pitch: 1 }, { level: 0, pitch: 1 }]);
    }, 1);
    // (after it has faded in)
    const tail = hum.data.slice(Math.floor(hum.rate * 0.5));
    let sum = 0, crossings = 0;
    for (let i = 0; i < tail.length; i++) {
      sum += tail[i] * tail[i];
      if (i > 0 && tail[i - 1] < 0 !== tail[i] < 0) crossings++;
    }
    const rms = Math.sqrt(sum / tail.length);
    expect(rms).toBeGreaterThan(0.002);
    expect(rms).toBeLessThan(swing.rms / 2);
    expect(hum.peak).toBeLessThan(swing.peak / 2);
    // (a low buzz: it crosses zero a few hundred times a second, not thousands)
    expect(crossings / (tail.length / hum.rate)).toBeLessThan(600);
  });
});
