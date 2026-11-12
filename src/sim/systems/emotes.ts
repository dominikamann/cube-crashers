import type { Command, EmoteId, SimState } from '../types';

/** the six quick messages, in the order of the keys 1–6 */
export const EMOTES: EmoteId[] = ['help', 'here', 'nest', 'coins', 'nice', 'gg'];
/** one emote a second per player at most */
export const EMOTE_COOLDOWN_TICKS = 60;

/** A player says something: everyone sees it (it travels with the events). Pings carry the spot. */
export function handleEmote(s: SimState, c: Extract<Command, { type: 'emote' }>): void {
  const p = s.players.find(x => x.id === c.playerId);
  if (!p || !EMOTES.includes(c.emote) || s.tick - p.lastEmoteAt < EMOTE_COOLDOWN_TICKS) return;
  p.lastEmoteAt = s.tick;
  s.events.push(c.at ? { type: 'emote', playerId: p.id, emote: c.emote, pos: { ...c.at } } : { type: 'emote', playerId: p.id, emote: c.emote });
}
