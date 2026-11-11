import { t } from '../i18n';
import { MAX_TOWER_LEVEL, TOWERS, towerStats, upgradeCost } from '../sim/config/towers';
import type { SimEvent, SimState, TowerKind } from '../sim/types';

const ORDER: TowerKind[] = ['laser', 'popcorn', 'frost'];

export interface BuildMenu {
  update(s: SimState, open: boolean, events: SimEvent[], localId: number, padId: number | null): void;
  /** controller: the cards show the d-pad directions instead of 1–3 */
  setPadLabels(on: boolean): void;
}

export function createBuildMenu(root: HTMLElement, onChoose: (kind: TowerKind) => void): BuildMenu {
  const layer = document.createElement('div');
  layer.className = 'ui-layer';
  const wrap = document.createElement('div');
  wrap.className = 'build';
  layer.append(wrap);
  root.append(layer);

  const cards = ORDER.map((kind, i) => {
    const card = document.createElement('div');
    card.className = 'card txt';
    card.innerHTML = `<div class="key">${i + 1}</div><div class="name">${t(`tower.${kind}`)}</div><div>${t(`tower.${kind}.desc`)}</div><div class="cost">● ${TOWERS[kind].cost}</div>`;
    card.addEventListener('mousedown', e => {
      e.preventDefault();
      onChoose(kind);
    });
    wrap.append(card);
    return { kind, card };
  });

  // on a pad with a finished tower: one card with the next level
  const up = document.createElement('div');
  up.className = 'card upgrade txt';
  up.addEventListener('mousedown', e => {
    e.preventDefault();
    onChoose('laser');
  });
  wrap.append(up);
  let upKey = '';
  let padLabels = false;
  const PAD_KEYS = ['\u25C0', '\u25B2', '\u25B6'];

  return {
    setPadLabels(on) {
      if (on === padLabels) return;
      padLabels = on;
      upKey = '';
      cards.forEach((c, i) => (c.card.querySelector('.key')!.textContent = on ? PAD_KEYS[i] : String(i + 1)));
    },
    update(s, open, events, localId, padId) {
      wrap.style.display = open ? '' : 'none';
      const coins = (s.players.find(p => p.id === localId) ?? s.players[0]).coins;
      const tower = padId === null ? undefined : s.towers.find(tw => tw.padId === padId);
      for (const c of cards) c.card.style.display = tower ? 'none' : '';
      // the first card is preselected: a tap of E (X) or simply holding on builds it
      cards.forEach((c, i) => c.card.classList.toggle('selected', i === 0));
      up.classList.add('selected');
      up.style.display = tower ? '' : 'none';
      if (tower) {
        const max = tower.level >= MAX_TOWER_LEVEL;
        const cost = max ? 0 : upgradeCost(tower.kind, tower.level + 1);
        const key = `${tower.kind}-${tower.level}-${tower.upgrading}`;
        if (key !== upKey) {
          upKey = key;
          const now = towerStats(tower.kind, tower.level), next = towerStats(tower.kind, tower.level + 1);
          up.innerHTML = max
            ? `<div class="name">${t(`tower.${tower.kind}`)} · ${t('tower.level', { n: tower.level })}</div><div>${t('tower.maxLevel')}</div>`
            : `<div class="key">${padLabels ? PAD_KEYS.join(' ') : '1'}</div><div class="name">${t('tower.upgrade', { n: tower.level + 1 })}</div><div>${now.damage > 0 ? t('tower.upgradeDesc', { dmg: Math.round((next.damage / now.damage - 1) * 100), range: next.range - now.range }) : t('tower.upgradeDescFrost', { range: next.range - now.range })}</div><div class="cost">● ${cost}</div>`;
        }
        up.classList.toggle('poor', max || coins < cost);
      } else {
        for (const c of cards) c.card.classList.toggle('poor', coins < TOWERS[c.kind].cost);
      }
      if (events.some(e => e.type === 'upgradeDenied' && e.reason === 'coins' && e.playerId === localId)) {
        up.classList.remove('shake');
        void up.offsetWidth;
        up.classList.add('shake');
      }
      if (events.some(e => e.type === 'buildDenied' && e.reason === 'coins' && e.playerId === localId)) {
        for (const c of cards) {
          if (!c.card.classList.contains('poor')) continue;
          c.card.classList.remove('shake');
          void c.card.offsetWidth;
          c.card.classList.add('shake');
        }
      }
    },
  };
}
