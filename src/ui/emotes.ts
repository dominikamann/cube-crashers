import { keyName, t } from '../i18n';
import { WEAPON_ACTIONS } from '../input/bindings';
import { cssColor, playerColor } from '../render/palette';
import { EMOTES } from '../sim/systems/emotes';
import type { SimEvent, SimState, Vec2 } from '../sim/types';

/** how long a speech bubble and a ping stay up (seconds) */
const BUBBLE_SECONDS = 2.5;
const PING_SECONDS = 5;

interface Shown {
  el: HTMLDivElement;
  until: number;
  /** over this player's head, or at a spot on the ground (pings) */
  playerId: number | null;
  pos: Vec2 | null;
}

type Project = (x: number, z: number, y: number) => { x: number; y: number; behind: boolean };

/**
 * Quick messages on screen: a speech bubble over the player who said it, a marker on the ground for pings,
 * and the emote bar while it is open (C by default).
 */
export function createEmotes(root: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'ui-layer emotes';
  root.append(layer);
  const bar = document.createElement('div');
  bar.className = 'emote-bar';
  bar.style.display = 'none';
  root.append(bar);
  // drawn on opening, so it always names the player's current keys
  const drawBar = () => {
    bar.innerHTML = `<div class="emote-title">${t('emote.bar')}</div>${EMOTES.map((e, i) => `<div class="emote-key"><b>${keyName(WEAPON_ACTIONS[i])}</b>${t(`emote.${e}`)}</div>`).join('')}`;
  };
  const shown: Shown[] = [];

  return {
    setBar(open: boolean) {
      if (open && bar.style.display === 'none') drawBar();
      bar.style.display = open ? '' : 'none';
    },
    update(s: SimState, events: SimEvent[], now: number, project: Project) {
      for (const e of events) {
        if (e.type !== 'emote') continue;
        const who = s.players.find(p => p.id === e.playerId);
        if (!who) continue;
        // one bubble per player: a new message replaces the old one
        if (!e.pos) for (const old of shown.filter(x => x.playerId === e.playerId)) old.until = 0;
        const el = document.createElement('div');
        el.className = e.pos ? 'emote ping' : 'emote';
        el.style.setProperty('--who', cssColor(playerColor(who.color)));
        el.textContent = e.pos ? `${who.name}: ${t(`emote.${e.emote}`)}` : t(`emote.${e.emote}`);
        layer.append(el);
        shown.push({ el, until: now + (e.pos ? PING_SECONDS : BUBBLE_SECONDS), playerId: e.pos ? null : e.playerId, pos: e.pos ?? null });
      }
      const box = layer.getBoundingClientRect();
      for (let i = shown.length - 1; i >= 0; i--) {
        const it = shown[i];
        const who = it.playerId === null ? null : s.players.find(p => p.id === it.playerId);
        if (now >= it.until || (it.playerId !== null && !who)) {
          it.el.remove();
          shown.splice(i, 1);
          continue;
        }
        const at = it.pos ?? who!.pos;
        const p = project(at.x, at.z, it.pos ? 0.2 : 2.6);
        it.el.style.display = p.behind ? 'none' : '';
        it.el.style.transform = `translate(${p.x - box.left}px, ${p.y - box.top}px) translate(-50%, -100%)`;
        it.el.style.opacity = String(Math.min(1, (it.until - now) * 2));
      }
    },
    clear() {
      for (const it of shown) it.el.remove();
      shown.length = 0;
    },
  };
}
