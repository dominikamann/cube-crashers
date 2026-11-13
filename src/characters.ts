/**
 * The cast: what a player's figure is. It is a look only: every character moves, fights and gets hit
 * exactly like every other. A player picks one in the settings or leaves it to the game, which then gives
 * everyone in a match a different one; bots are robots, each a little different.
 */

/** free for everyone */
export const FREE_CHARACTERS = ['astronaut', 'knight', 'cat', 'duck', 'cabinet', 'cube', 'joystick', 'ghost', 'mushroom', 'cup'] as const;
/** earned: the boss has to fall first, then they cost tickets */
export const EARNED_CHARACTERS = ['babyDino', 'dominik'] as const;
export const CHARACTERS = [...FREE_CHARACTERS, ...EARNED_CHARACTERS] as const;
export type CharacterId = (typeof CHARACTERS)[number];

/** the robots the bots are */
export const BOT_CHASSIS = ['boxy', 'wheel', 'treads', 'hover'] as const;
export type BotChassis = (typeof BOT_CHASSIS)[number];
export const BOT_FACES = 4;
export const BOT_ANTENNAS = 3;

export interface Look {
  kind: CharacterId | BotChassis;
  bot: boolean;
  /** bots: which face is on the screen and which antenna is on top */
  face: number;
  antenna: number;
}

export const isCharacter = (x: unknown): x is CharacterId => typeof x === 'string' && (CHARACTERS as readonly string[]).includes(x);

/** bots are told by their name: the game calls them "Bot …" (a player's state has no other mark) */
export const isBotName = (name: string): boolean => /^Bot\b/.test(name);

/** FNV-1a: the same number for the same name on every computer */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The look of every player of a match. A chosen character is taken as it is; an unknown one counts as not
 * chosen. Everyone else gets the one their name stands for, or the next one nobody has yet, so no two look
 * alike while there are characters left. Depends only on ids, names and choices: the same on every client.
 */
export function looksFor(players: readonly { id: number; name: string; character?: string }[]): Map<number, Look> {
  const looks = new Map<number, Look>();
  const order = [...players].sort((a, b) => a.id - b.id);
  const taken = new Set<string>();
  for (const p of order) {
    if (!isCharacter(p.character)) continue;
    looks.set(p.id, { kind: p.character, bot: false, face: 0, antenna: 0 });
    taken.add(p.character);
  }
  const robots = new Set<string>();
  for (const p of order) {
    if (looks.has(p.id)) continue;
    const h = hash(p.name);
    if (isBotName(p.name)) {
      // the chassis the fewest bots have so far, and a face no bot with that chassis has yet
      const count = (kind: string) => [...robots].filter(r => r.startsWith(`${kind}:`)).length;
      const least = Math.min(...BOT_CHASSIS.map(count));
      const kind = BOT_CHASSIS.map((_, i) => BOT_CHASSIS[(h + i) % BOT_CHASSIS.length]).find(k => count(k) === least)!;
      const faces = Array.from({ length: BOT_FACES }, (_, i) => ((h >>> 4) + i) % BOT_FACES);
      const pick = { kind, face: faces.find(f => !robots.has(`${kind}:${f}`)) ?? faces[0] };
      looks.set(p.id, { kind: pick.kind, bot: true, face: pick.face, antenna: (h >>> 8) % BOT_ANTENNAS });
      continue;
    }
    const n = FREE_CHARACTERS.length;
    const wish = Array.from({ length: n }, (_, i) => FREE_CHARACTERS[(h + i) % n]);
    const kind = wish.find(k => !taken.has(k)) ?? wish[0];
    taken.add(kind);
    looks.set(p.id, { kind, bot: false, face: 0, antenna: 0 });
  }
  return looks;
}
