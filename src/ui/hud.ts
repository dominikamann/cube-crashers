import { t } from '../i18n';
import { MAX_WEAPON_LEVEL, MAX_WEAPONS } from '../sim/config/weapons';
import { padAt } from '../sim/systems/towers';
import { WEAPON_GLYPH } from '../render/pickups';
import { TICK_RATE, type SimEvent, type SimState } from '../sim/types';

export interface Hud {
  update(s: SimState, events: SimEvent[], buildMenuOpen: boolean): void;
  setVisible(v: boolean): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

export function createHud(root: HTMLElement): Hud {
  const layer = el('div', 'ui-layer hud', root);
  const top = el('div', 'hud-top', layer);
  el('div', '', top);
  el('div', '', top);
  const coinBox = el('div', 'hud-box coins txt', top);
  el('div', 'coin-icon', coinBox);
  const coinText = el('span', '', coinBox, '0');

  const bottom = el('div', 'hud-bottom', layer);
  const hpBox = el('div', 'hud-box player-hp txt', bottom, '♥ HP');
  const hpFill = el('i', '', el('div', 'bar', hpBox));
  const weaponRow = el('div', 'weapons', bottom);
  const slots = Array.from({ length: MAX_WEAPONS }, () => {
    const slot = el('div', 'slot empty txt', weaponRow);
    const glyph = el('div', 'glyph', slot);
    const name = el('div', '', slot);
    const pips = el('div', 'pips', slot);
    const pipEls = Array.from({ length: MAX_WEAPON_LEVEL }, () => el('b', '', pips));
    return { slot, glyph, name, pipEls };
  });

  const hint = el('div', 'hint txt', layer, t('hud.build'));
  const down = el('div', 'down txt', layer);

  let lastCoins = -1;
  let lastWeaponsKey = '';

  return {
    setVisible(v) {
      layer.style.display = v ? '' : 'none';
    },
    update(s, _events, buildMenuOpen) {
      const p = s.players[0];
      if (p.coins !== lastCoins) {
        coinText.textContent = String(p.coins);
        if (p.coins > lastCoins && lastCoins >= 0) {
          coinBox.classList.remove('bump');
          void coinBox.offsetWidth;
          coinBox.classList.add('bump');
        }
        lastCoins = p.coins;
      }

      hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;
      const key = p.weapons.map(w => `${w.kind}${w.level}`).join();
      if (key !== lastWeaponsKey) {
        lastWeaponsKey = key;
        slots.forEach((sl, i) => {
          const w = p.weapons[i];
          sl.slot.classList.toggle('empty', !w);
          sl.glyph.textContent = w ? WEAPON_GLYPH[w.kind] : '';
          sl.name.textContent = w ? t(`weapon.${w.kind}`).split(' ').pop()! : '';
          sl.pipEls.forEach((b, j) => b.classList.toggle('on', !!w && j < w.level));
        });
      }

      const onFreePad = p.downUntil === null && (() => {
        const pad = padAt(s, p.pos);
        return pad !== null && !s.towers.some(tw => tw.padId === pad);
      })();
      hint.style.display = onFreePad && !buildMenuOpen ? '' : 'none';

      if (p.downUntil !== null) {
        down.style.display = '';
        down.textContent = t('hud.down', { s: Math.max(0, Math.ceil((p.downUntil - s.tick) / TICK_RATE)) });
      } else {
        down.style.display = 'none';
      }
    },
  };
}
