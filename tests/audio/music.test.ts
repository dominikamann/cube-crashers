import { describe, expect, it } from 'vitest';
import { parseLine, parseNote, TRACK_IDS, trackPatterns } from '../../src/audio/music';

describe('music notation', () => {
  it('parses notes, rests and holds', () => {
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('A#4')).toBe(70);
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('.')).toBeNull();
    expect(parseNote('-')).toBe('hold');
  });

  it('every pattern of every track has 16 valid steps per channel', () => {
    expect(TRACK_IDS).toEqual(['menu', 'battle', 'boss']);
    for (const id of TRACK_IDS) {
      for (const p of trackPatterns(id)) {
        expect(parseLine(p.lead)).toHaveLength(16);
        expect(parseLine(p.harm)).toHaveLength(16);
        expect(parseLine(p.bass)).toHaveLength(16);
        expect(p.drums.trim().split(/\s+/)).toHaveLength(16);
      }
    }
  });
});
