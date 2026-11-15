import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { ROTOR_FAR, ROTOR_NEAR, rotorLoudness } from '../../src/audio/ambience';
import { createMixer } from '../../src/audio/mixer';
import { HELIPAD } from '../../src/sim/config/floor-helipad';

const peakOf = async (ctx: OfflineAudioContext) => {
  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  return peak;
};

describe("the helicopter's rotor", () => {
  it('is heard on the helipad only, loudest by the helicopter and fading with the distance, by the nearest player on the screen', () => {
    const { pad } = HELIPAD;
    expect(rotorLoudness('rooftop', [{ x: pad.x, z: pad.z }])).toBe(0);
    expect(rotorLoudness('helipad', [])).toBe(0);
    expect(rotorLoudness('helipad', [{ x: pad.x + 2, z: pad.z }])).toBe(1);
    const half = rotorLoudness('helipad', [{ x: pad.x + (ROTOR_NEAR + ROTOR_FAR) / 2, z: pad.z }]);
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.5);
    expect(rotorLoudness('helipad', [{ x: pad.x, z: pad.z + ROTOR_FAR + 1 }])).toBe(0);
    // the spawn at the south still hears it
    expect(rotorLoudness('helipad', [{ x: 30.5, z: 46.5 }])).toBeGreaterThan(0.1);
    expect(rotorLoudness('helipad', [{ x: pad.x, z: pad.z + ROTOR_FAR + 1 }, { x: pad.x, z: pad.z }])).toBe(1);
  });

  it('sounds while it is turned up, and not at all once it is turned off', async () => {
    const on = new OfflineAudioContext(2, 44100, 44100);
    createMixer(on as unknown as BaseAudioContext).setAmbience('rotor', 1);
    const peak = await peakOf(on);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
    const off = new OfflineAudioContext(2, 44100, 44100);
    const mixer = createMixer(off as unknown as BaseAudioContext);
    mixer.setAmbience('rotor', 1);
    mixer.setAmbience('rotor', 0);
    // (it is turned down over a short while, not cut: by the end of the second nothing is left)
    const buf = await off.startRendering();
    let tail = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = data.length - 4410; i < data.length; i++) tail = Math.max(tail, Math.abs(data[i]));
    }
    expect(tail).toBeLessThan(0.002);
    // and one that was never turned up starts nothing
    const never = new OfflineAudioContext(2, 4410, 44100);
    createMixer(never as unknown as BaseAudioContext).setAmbience('rotor', 0);
    expect(await peakOf(never)).toBe(0);
  });
});
