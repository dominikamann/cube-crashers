import { t } from '../i18n';
import { TOWERS } from '../sim/config/towers';
import type { SimEvent, SimState, TowerKind } from '../sim/types';

const ORDER: TowerKind[] = ['laser', 'popcorn', 'frost'];

export interface BuildMenu {
  update(s: SimState, open: boolean, events: SimEvent[]): void;
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

  return {
    update(s, open, events) {
      wrap.style.display = open ? '' : 'none';
      const coins = s.players[0].coins;
      for (const c of cards) c.card.classList.toggle('poor', coins < TOWERS[c.kind].cost);
      if (events.some(e => e.type === 'buildDenied' && e.reason === 'coins')) {
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
