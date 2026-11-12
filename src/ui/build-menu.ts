import { keyName, t } from '../i18n';
import { WEAPON_ACTIONS } from '../input/bindings';
import { MAX_TOWER_LEVEL, TOWER_ORDER as ORDER, TOWERS, towerStats, upgradeCost } from '../sim/config/towers';
import type { SimEvent, SimState, TowerKind } from '../sim/types';

export interface BuildMenu {
  update(s: SimState, open: boolean, events: SimEvent[], localId: number, padId: number | null, selected: TowerKind): void;
  /** controller: the cards show the d-pad directions instead of 1–3 */
  setPadLabels(on: boolean): void;
}

export function createBuildMenu(root: HTMLElement, onChoose: (kind: TowerKind) => void): BuildMenu {
  const layer = document.createElement('div');
  layer.className = 'ui-layer ui-scaled';
  const wrap = document.createElement('div');
  wrap.className = 'build';
  layer.append(wrap);
  root.append(layer);

  /** the key shown on card i: the player's weapon key of that slot */
  const cardKey = (i: number) => keyName(WEAPON_ACTIONS[i]);
  const cards = ORDER.map((kind, i) => {
    const card = document.createElement('div');
    card.className = 'card txt';
    card.innerHTML = `<div class="key">${cardKey(i)}</div><div class="name">${t(`tower.${kind}`)}</div><div>${t(`tower.${kind}.desc`)}</div><div class="cost">● ${TOWERS[kind].cost}</div>`;
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
  // how to choose: shown under the cards
  const help = document.createElement('div');
  help.className = 'build-help txt';
  layer.append(help);
  let upKey = '';
  let padLabels = false;

  return {
    setPadLabels(on) {
      if (on === padLabels) return;
      padLabels = on;
      upKey = '';
      cards.forEach((c, i) => (c.card.querySelector('.key')!.textContent = on ? '' : cardKey(i)));
      cards.forEach(c => c.card.querySelector('.key')!.classList.toggle('hidden', on));
    },
    update(s, open, events, localId, padId, selected) {
      wrap.style.display = open ? '' : 'none';
      help.style.display = open ? '' : 'none';
      const coins = (s.players.find(p => p.id === localId) ?? s.players[0]).coins;
      const tower = padId === null ? undefined : s.towers.find(tw => tw.padId === padId);
      for (const c of cards) c.card.style.display = tower ? 'none' : '';
      // the keys may have been changed in the pause menu
      if (open && !padLabels) cards.forEach((c, i) => {
        const k = c.card.querySelector('.key')!;
        if (k.textContent !== cardKey(i)) k.textContent = cardKey(i);
      });
      // the selected card: E (X) builds it, holding on from the opening press builds it too
      cards.forEach(c => c.card.classList.toggle('selected', c.kind === selected));
      const helpText = tower ? t(padLabels ? 'build.helpUpgradePad' : 'build.helpUpgrade') : t(padLabels ? 'build.helpPad' : 'build.help');
      if (help.textContent !== helpText) help.textContent = helpText;
      up.classList.add('selected');
      up.style.display = tower ? '' : 'none';
      if (tower) {
        const max = tower.level >= MAX_TOWER_LEVEL;
        const cost = max ? 0 : upgradeCost(tower.kind, tower.level + 1);
        const useKey = padLabels ? 'X' : keyName('use');
        const key = `${tower.kind}-${tower.level}-${tower.upgrading}-${useKey}`;
        if (key !== upKey) {
          upKey = key;
          const now = towerStats(tower.kind, tower.level), next = towerStats(tower.kind, tower.level + 1);
          up.innerHTML = max
            ? `<div class="name">${t(`tower.${tower.kind}`)} · ${t('tower.level', { n: tower.level })}</div><div>${t('tower.maxLevel')}</div>`
            : `<div class="key">${useKey}</div><div class="name">${t('tower.upgrade', { n: tower.level + 1 })}</div><div>${now.damage > 0 ? t('tower.upgradeDesc', { dmg: Math.round((next.damage / now.damage - 1) * 100), range: next.range - now.range }) : t('tower.upgradeDescFrost', { range: next.range - now.range })}</div><div class="cost">● ${cost}</div>`;
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
