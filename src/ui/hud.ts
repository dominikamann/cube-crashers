import { t } from '../i18n';
import { WEAPON_GLYPH } from '../render/pickups';
import { ALARM_MAX, HOLD_RADIUS, HOLD_TICKS, PLANT_RANGE, START_CREDITS } from '../sim/config/balance';
import { MAX_WEAPON_LEVEL, MAX_WEAPONS, WEAPONS } from '../sim/config/weapons';
import { comboMult } from '../sim/systems/combat';
import { maxDashCharges } from '../sim/systems/player';
import { padAt } from '../sim/systems/towers';
import { KART } from '../sim/systems/vehicles';
import { TICK_RATE, type SimEvent, type SimState } from '../sim/types';
import { createMinimap } from './minimap';

export interface Hud {
  update(s: SimState, events: SimEvent[], buildMenuOpen: boolean, time: number): void;
  setVisible(v: boolean): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function createHud(root: HTMLElement): Hud {
  const layer = el('div', 'ui-layer hud', root);
  const top = el('div', 'hud-top', layer);

  const runBox = el('div', 'hud-box txt', top);
  const creditRow = el('div', 'credits', runBox);
  const creditEls = Array.from({ length: START_CREDITS }, () => el('i', 'credit', creditRow));
  const nestText = el('div', 'sub', runBox);

  const alarmBox = el('div', 'hud-box hud-center txt', top);
  el('div', '', alarmBox, t('hud.alarm'));
  const alarmRow = el('div', 'alarm', alarmBox);
  const alarmEls = Array.from({ length: ALARM_MAX }, () => el('i', '', alarmRow));

  const scoreBox = el('div', 'hud-box txt score', top);
  const scoreText = el('div', '', scoreBox);
  const coinRow = el('div', 'coins', scoreBox);
  el('div', 'coin-icon', coinRow);
  const coinText = el('span', '', coinRow, '0');

  const combo = el('div', 'combo txt', layer);
  const comboMultEl = el('div', 'mult', combo);
  const comboCount = el('div', 'count', combo);
  const comboFill = el('i', '', el('div', 'bar', combo));

  const holdBox = el('div', 'hold txt', layer);
  const holdText = el('div', '', holdBox);
  const holdFill = el('i', '', el('div', 'bar', holdBox));

  const toasts = el('div', 'toasts', layer);

  const bottom = el('div', 'hud-bottom', layer);
  const left = el('div', 'hud-box player-hp txt', bottom, '♥ HP');
  const hpFill = el('i', '', el('div', 'bar', left));
  const dashRow = el('div', 'dashes', left);
  const kartBox = el('div', 'kart', left);
  el('div', 'sub', kartBox, t('hud.fuel'));
  const fuelFill = el('i', '', el('div', 'bar fuel', kartBox));
  el('div', 'sub', kartBox, t('hud.kart'));
  const kartFill = el('i', '', el('div', 'bar', kartBox));

  const weaponRow = el('div', 'weapons', bottom);
  const slots = Array.from({ length: MAX_WEAPONS }, (_, i) => {
    const slot = el('div', 'slot empty txt', weaponRow);
    el('div', 'key', slot, String(i + 1));
    const glyph = el('div', 'glyph', slot);
    const pips = el('div', 'pips', slot);
    const pipEls = Array.from({ length: MAX_WEAPON_LEVEL }, () => el('b', '', pips));
    const reload = el('i', '', el('div', 'reload', slot));
    return { slot, glyph, pipEls, reload };
  });

  const mapBox = el('div', 'hud-box mapbox', bottom);
  const minimap = createMinimap(mapBox);

  const hint = el('div', 'hint txt', layer);
  const down = el('div', 'down txt', layer);
  const danger = el('div', 'danger', layer);

  let lastCoins = -1;
  let lastWeaponsKey = '';
  let lastDash = '';

  function toast(text: string, kind: '' | 'warn' | 'good' = '') {
    const e = el('div', `toast txt ${kind}`, toasts, text);
    setTimeout(() => e.remove(), 1900);
    while (toasts.childElementCount > 4) toasts.firstElementChild!.remove();
  }

  function bump(e: HTMLElement) {
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }

  return {
    setVisible(v) {
      layer.style.display = v ? '' : 'none';
    },
    update(s, events, buildMenuOpen, time) {
      const p = s.players[0];

      creditEls.forEach((c, i) => c.classList.toggle('on', i < s.credits));
      const alive = s.nests.filter(n => n.state !== 'destroyed').length;
      nestText.textContent = t('hud.nests', { n: s.nests.length - alive, total: s.nests.length });
      alarmEls.forEach((a, i) => a.classList.toggle('on', i < s.alarm.level));
      alarmBox.classList.toggle('overload', s.alarm.level >= ALARM_MAX);
      scoreText.textContent = t('hud.score', { score: s.score });
      if (p.coins !== lastCoins) {
        coinText.textContent = String(p.coins);
        if (p.coins > lastCoins && lastCoins >= 0) bump(coinRow);
        lastCoins = p.coins;
      }

      const mult = comboMult(p);
      combo.style.display = p.combo >= 3 ? '' : 'none';
      comboMultEl.textContent = `×${mult}`;
      comboMultEl.dataset.tier = String(Math.min(4, Math.floor(mult / 2)));
      comboCount.textContent = t('hud.combo', { n: p.combo });
      comboFill.style.width = `${Math.max(0, Math.min(1, (p.comboUntil - s.tick) / 180)) * 100}%`;

      const nest = s.nests.find(n => n.state === 'planted' && dist(n.pos, p.pos) < 16);
      holdBox.style.display = nest ? '' : 'none';
      if (nest) {
        const pct = Math.floor((nest.progress / HOLD_TICKS) * 100);
        const inside = dist(nest.pos, p.pos) <= HOLD_RADIUS && p.downUntil === null;
        holdText.textContent = t(inside ? 'hud.hold' : 'hud.holdAway', { pct });
        holdBox.classList.toggle('away', !inside);
        holdFill.style.width = `${pct}%`;
      }

      hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;
      danger.style.display = p.hp < 30 && p.downUntil === null && s.phase === 'playing' ? '' : 'none';
      const dashKey = `${p.dashCharges}/${maxDashCharges(p)}`;
      if (dashKey !== lastDash) {
        lastDash = dashKey;
        dashRow.innerHTML = '';
        for (let i = 0; i < maxDashCharges(p); i++) el('i', i < p.dashCharges ? 'on' : '', dashRow);
      }
      const kart = p.vehicleId !== null ? s.vehicles.find(v => v.id === p.vehicleId) : undefined;
      kartBox.style.display = kart ? '' : 'none';
      if (kart) {
        fuelFill.style.width = `${(kart.fuel / KART.fuelTicks) * 100}%`;
        kartFill.style.width = `${Math.max(0, kart.hp / KART.hp) * 100}%`;
      }

      const key = p.weapons.map(w => `${w.kind}${w.level}`).join();
      if (key !== lastWeaponsKey) {
        lastWeaponsKey = key;
        slots.forEach((sl, i) => {
          const w = p.weapons[i];
          sl.slot.classList.toggle('empty', !w);
          sl.glyph.textContent = w ? WEAPON_GLYPH[w.kind] : '';
          sl.pipEls.forEach((b, j) => b.classList.toggle('on', !!w && j < w.level));
        });
      }
      slots.forEach((sl, i) => {
        const w = p.weapons[i];
        sl.slot.classList.toggle('selected', !!w && i === p.selected);
        if (!w) return;
        const ready = w.cooldown === 0;
        sl.slot.classList.toggle('ready', ready);
        sl.reload.style.width = `${(1 - Math.min(1, w.cooldown / WEAPONS[w.kind].cooldown)) * 100}%`;
      });

      let hintText = '';
      if (p.downUntil === null && !buildMenuOpen) {
        const pad = padAt(s, p.pos);
        if (p.vehicleId !== null) hintText = t('hud.leave');
        else if (s.nests.some(n => n.state === 'idle' && dist(n.pos, p.pos) <= PLANT_RANGE)) hintText = t('hud.plant');
        else if (s.vehicles.some(v => v.driverId === null && dist(v.pos, p.pos) <= KART.enterRange)) hintText = t('hud.drive');
        else if (pad !== null && !s.towers.some(tw => tw.padId === pad)) hintText = t('hud.build');
        else if (s.elevatorOpen) hintText = t('hud.goElevator');
      }
      hint.textContent = hintText;
      hint.style.display = hintText ? '' : 'none';

      if (p.downUntil !== null && s.phase === 'playing') {
        down.style.display = '';
        down.textContent = t('hud.down', { s: Math.max(0, Math.ceil((p.downUntil - s.tick) / TICK_RATE)) });
      } else {
        down.style.display = 'none';
      }

      for (const e of events) {
        switch (e.type) {
          case 'alarmChanged':
            if (e.level >= ALARM_MAX) toast(t('toast.overload'), 'warn');
            else if (e.level > 0) toast(t('toast.alarm', { level: e.level }), 'warn');
            break;
          case 'nestPlanted':
            toast(t('toast.planted'));
            break;
          case 'nestDestroyed':
            toast(t('toast.nestDown', { left: s.nests.filter(n => n.state !== 'destroyed').length }), 'good');
            break;
          case 'elevatorOpen':
            toast(t('toast.elevator'), 'good');
            break;
          case 'creditLost':
            if (e.credits > 0) toast(t('toast.creditLost', { credits: e.credits }), 'warn');
            break;
          case 'powerupSpawned':
            toast(t('toast.powerup', { name: t(`powerup.${e.kind}`) }));
            break;
          case 'powerupPicked':
            toast(t(`powerup.${e.kind}`), 'good');
            break;
          case 'crateCoins':
            toast(t('toast.crateCoins', { coins: e.coins }), 'good');
            break;
          case 'cardPicked':
            toast(t('toast.card', { name: e.card.type === 'weapon' ? t(`weapon.${e.card.weapon}`) : t(`perk.${e.card.perk}`), level: e.level }), 'good');
            break;
          case 'comboUp':
            bump(combo);
            break;
        }
      }

      minimap.update(s, time);
    },
  };
}
