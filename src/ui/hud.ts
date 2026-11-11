import { t } from '../i18n';
import { WAVES } from '../sim/config/waves';
import { MAX_WEAPON_LEVEL, MAX_WEAPONS } from '../sim/config/weapons';
import { bossHp } from '../sim/systems/boss';
import { padAt } from '../sim/systems/towers';
import { TICK_RATE, type SimEvent, type SimState, type WeaponKind } from '../sim/types';

export const WEAPON_GLYPH: Record<WeaponKind, string> = {
  pixelBlaster: '✦',
  laserSword: '⚔',
  candyCannon: '🍬',
  hotdogSlinger: '🌭',
  joystickBoomerang: '🪃',
  discoBall: '🪩',
};

export interface Hud {
  update(s: SimState, events: SimEvent[], buildMenuOpen: boolean): void;
  setVisible(v: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

export function createHud(root: HTMLElement): Hud {
  const layer = el('div', 'ui-layer hud', root);
  const top = el('div', 'hud-top', layer);

  const baseBox = el('div', 'hud-box txt', top, '🕹 BASE');
  const baseBar = el('div', 'bar', baseBox);
  const baseFill = el('i', '', baseBar);

  const waveBox = el('div', 'hud-box hud-center txt', top);
  const waveText = el('div', '', waveBox);
  const waveSub = el('div', 'sub', waveBox);

  const coinBox = el('div', 'hud-box coins txt', top);
  el('div', 'coin-icon', coinBox);
  const coinText = el('span', '', coinBox, '0');

  const bossBox = el('div', 'boss txt', layer);
  const bossName = el('div', '', bossBox);
  const bossBar = el('div', 'bar', bossBox);
  const bossFill = el('i', '', bossBar);
  for (const f of [0.66, 0.33]) el('div', 'mark', bossBar).style.left = `${f * 100}%`;

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
  const danger = el('div', 'danger', layer);

  let lastCoins = -1;
  let lastWeaponsKey = '';

  function toast(text: string, warn = false) {
    const e = el('div', `toast txt${warn ? ' warn' : ''}`, layer, text);
    setTimeout(() => e.remove(), 1700);
  }

  return {
    setVisible(v) {
      layer.style.display = v ? '' : 'none';
    },
    update(s, events, buildMenuOpen) {
      const p = s.players[0];
      const baseF = s.base.hp / s.base.maxHp;
      baseFill.style.width = `${baseF * 100}%`;
      baseFill.style.background = baseF > 0.5 ? 'var(--green)' : baseF > 0.25 ? 'var(--gold)' : 'var(--red)';
      danger.style.display = baseF <= 0.25 && s.phase === 'playing' ? '' : 'none';

      const wave = Math.max(1, s.wave.index + 1);
      waveText.textContent = t('hud.wave', { n: wave, total: WAVES.length });
      const pauseLeft = s.wave.pauseUntil !== null ? Math.ceil((s.wave.pauseUntil - s.tick) / TICK_RATE) : 0;
      waveSub.textContent = pauseLeft > 0 && s.wave.index < WAVES.length - 1 ? t('hud.nextWave', { s: pauseLeft }) : '';

      if (p.coins !== lastCoins) {
        coinText.textContent = String(p.coins);
        if (p.coins > lastCoins && lastCoins >= 0) {
          coinBox.classList.remove('bump');
          void coinBox.offsetWidth;
          coinBox.classList.add('bump');
        }
        lastCoins = p.coins;
      }

      if (s.boss) {
        bossBox.style.display = '';
        bossName.textContent = t(s.boss.kind === 'worm' ? 'boss.worm' : 'boss.miniboss');
        bossFill.style.width = `${(bossHp(s) / s.boss.maxHp) * 100}%`;
      } else {
        bossBox.style.display = 'none';
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

      for (const e of events) {
        if (e.type === 'waveStart') toast(t('hud.waveStart', { n: e.wave }));
        if (e.type === 'bossSpawn') toast(t('hud.bossIncoming'), true);
        if (e.type === 'crateOpened' && e.playerId === p.id) toast(t('hud.newWeapon', { weapon: t(`weapon.${e.weapon}`), level: e.level }));
      }
    },
  };
}
