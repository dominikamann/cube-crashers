import { describe, expect, it } from 'vitest';
import { DISCO_EARSHOT, discoHeard, parseLine, parseNote, TRACK_IDS, trackPatterns, trackToPlay } from '../../src/audio/music';

describe('music notation', () => {
  it('parses notes, rests and holds', () => {
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('A#4')).toBe(70);
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('.')).toBeNull();
    expect(parseNote('-')).toBe('hold');
  });

  it('every pattern of every track has 16 valid steps per channel', () => {
    expect(TRACK_IDS).toEqual(['menu', 'battle', 'boss', 'disco']);
    for (const id of TRACK_IDS) {
      for (const p of trackPatterns(id)) {
        expect(parseLine(p.lead)).toHaveLength(16);
        expect(parseLine(p.harm)).toHaveLength(16);
        expect(parseLine(p.bass)).toHaveLength(16);
        for (const line of p.chord ?? []) expect(parseLine(line)).toHaveLength(16);
        const drums = p.drums.trim().split(/\s+/);
        expect(drums).toHaveLength(16);
        for (const step of drums) expect(step).toMatch(/^(\.|[kshoc]+)$/);
      }
    }
  });

  it('the disco track is house: a kick on every beat, a clap on 2 and 4, an open hat off the beat, a bass that rests on the kick', () => {
    for (const p of trackPatterns('disco')) {
      const drums = p.drums.trim().split(/\s+/);
      const bass = parseLine(p.bass);
      for (const beat of [0, 4, 8, 12]) {
        expect(drums[beat]).toContain('k');
        expect(bass[beat]).toBeNull();
      }
      for (const beat of [4, 12]) expect(drums[beat]).toContain('c');
      for (const off of [2, 6, 10, 14]) expect(drums[off]).toMatch(/[oc]/);
      // a chord stab: three voices that strike together
      expect(p.chord).toHaveLength(2);
      const stab = [p.harm, ...p.chord!].map(parseLine);
      for (let i = 0; i < 16; i++) expect(new Set(stab.map(line => typeof line[i])).size).toBe(1);
    }
  });
});

describe('which track plays', () => {
  it('a Disco Ball in the air plays over the battle and the boss, and the track before comes back after', () => {
    expect(trackToPlay('battle', 10, 5)).toBe('disco');
    expect(trackToPlay('boss', 10, 9.99)).toBe('disco');
    expect(trackToPlay('battle', 10, 10)).toBe('battle');
    expect(trackToPlay('boss', 10, 12)).toBe('boss');
  });

  it('never over the menu or over the silence after a game', () => {
    expect(trackToPlay('menu', 10, 5)).toBe('menu');
    expect(trackToPlay(null, 10, 5)).toBeNull();
    expect(trackToPlay('battle', 0, 5)).toBe('battle');
  });

  it('a ball is heard near one of the players on this screen, not across the map', () => {
    const at = { x: 10, z: 10 };
    expect(discoHeard(at, [{ x: 12, z: 10 }])).toBe(true);
    expect(discoHeard(at, [{ x: 10 + DISCO_EARSHOT + 1, z: 10 }])).toBe(false);
    // split screen: one of the two is near
    expect(discoHeard(at, [{ x: 60, z: 60 }, { x: 10, z: 14 }])).toBe(true);
    // nobody of this screen is in the game (watching): every ball counts
    expect(discoHeard(at, [])).toBe(true);
  });
});
