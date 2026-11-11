import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { createMixer, VoiceLimiter } from '../../src/audio/mixer';

describe('VoiceLimiter', () => {
  it('allows only one start per sound within 20 ms', () => {
    const v = new VoiceLimiter();
    const started = Array.from({ length: 10 }, () => v.tryStart('enemyHit', 1.0, 0.5));
    expect(started.filter(Boolean)).toHaveLength(1);
  });

  it('caps a sound at 4 overlapping voices', () => {
    const v = new VoiceLimiter();
    const started = Array.from({ length: 10 }, (_, i) => v.tryStart('enemyKilled', 1 + i * 0.03, 1.0));
    expect(started.filter(Boolean)).toHaveLength(4);
  });

  it('frees voices once they have finished', () => {
    const v = new VoiceLimiter();
    for (let i = 0; i < 4; i++) v.tryStart('coin', i * 0.03, 0.1);
    expect(v.tryStart('coin', 0.5, 0.1)).toBe(true);
  });
});

describe('mixer', () => {
  it('does not clip with 40 simultaneous explosions', async () => {
    const ctx = new OfflineAudioContext(2, 44100 / 2, 44100);
    const mixer = createMixer(ctx as unknown as BaseAudioContext);
    mixer.limiter.reset();
    for (let i = 0; i < 40; i++) mixer.play('enemyKilled', 1, true);
    for (let i = 0; i < 40; i++) mixer.play('explosion', 1, true);
    const buf = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });
});
