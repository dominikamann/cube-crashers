import { allBosses } from '../sim/util';
import { DIFFICULTY } from '../sim/config/difficulty';
import { FLOORS } from '../sim/config/floors';
import { inZone } from '../sim/systems/nests';
import { RACE, raceSeconds } from '../sim/systems/race';
import { LANE } from '../sim/systems/lane';
import { MAZE } from '../sim/systems/maze';
import { BUILD_TICKS, MAX_TOWER_LEVEL, UPGRADE_TICKS } from '../sim/config/towers';
import { Tile, tileAt } from '../sim/map/tilemap';
import { t, type StringKey } from '../i18n';
import { cssColor, isColorBlind, palette } from '../render/palette';
import { RARE_GLYPH, WEAPON_GLYPH } from '../render/pickups';
import { JETPACK } from '../sim/config/rare';
import { ALARM_MAX, HOLD_TICKS, PLANT_RANGE, PLANT_TICKS, START_CREDITS } from '../sim/config/balance';
import { MAX_WEAPON_LEVEL, MAX_WEAPONS, WEAPONS } from '../sim/config/weapons';
import { comboMult } from '../sim/systems/combat';
import { maxDashCharges } from '../sim/systems/player';
import { padAt } from '../sim/systems/towers';
import { KART } from '../sim/systems/vehicles';
import { TICK_RATE, type SimEvent, type SimState } from '../sim/types';
import { createMinimap } from './minimap';
import { bossHp } from '../sim/systems/boss';
import { floorDef } from '../sim/config/floors';

export interface Hud {
  update(s: SimState, events: SimEvent[], buildMenuOpen: boolean, time: number, localId: number): void;
  setVisible(v: boolean): void;
  /** playing with a controller: hints name its button (X or □) instead of E; null = keyboard */
  setPadMode(useButton: string | null): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export interface ShopActions {
  buy(i: number): void;
  ready(): void;
}

/** the last floor of a run: its boss is the final boss */
const isFinalFloor = (s: SimState) => (s.run.mode === 'run' || s.run.mode === 'bossrush') && s.run.floor === s.run.floors.length - 1;
const bossLabel = (kind: string) => t(`boss.${kind}` as 'boss.worm');

/** how the health bar is coloured: fine above half, getting dangerous above a quarter, critical below */
export const hpLevel = (share: number): 'ok' | 'warn' | 'crit' => (share > 0.5 ? 'ok' : share > 0.25 ? 'warn' : 'crit');

export function createHud(root: HTMLElement, onShop: ShopActions): Hud {
  const layer = el('div', 'ui-layer hud ui-scaled', root);
  // the opening of a versus match: what is played, and 5 4 3 2 1 GO!
  const intro = el('div', 'versus-intro', layer);
  const introRule = el('div', 'versus-intro-rule', intro);
  const introMode = el('div', 'versus-intro-mode', intro);
  const introHint = el('div', 'versus-intro-hint', intro);
  const introCount = el('div', 'versus-intro-count', intro);
  let introShown = '';
  let goUntil = 0;
  let padMode: string | null = null;
  const top = el('div', 'hud-top', layer);

  const runBox = el('div', 'hud-box txt', top);
  const creditRow = el('div', 'credits', runBox);
  // your own lives (up to the most any level starts with), and your teammates' under them
  const creditEls = Array.from({ length: Math.max(START_CREDITS, ...Object.values(DIFFICULTY).map(d => d.credits)) }, () => el('i', 'credit', creditRow));
  const teamText = el('div', 'sub team', runBox);
  const outBanner = el('div', 'out-banner txt', layer);
  const nestText = el('div', 'sub', runBox);
  const floorText = el('div', 'sub floor', runBox);

  // the alarm sits in the left panel under the nests, so the top centre stays free for the view
  const alarmBox = el('div', 'alarm-in', runBox);
  el('div', 'sub', alarmBox, t('hud.alarm'));
  const alarmRow = el('div', 'alarm', alarmBox);
  const alarmEls = Array.from({ length: ALARM_MAX }, () => el('i', '', alarmRow));
  const alarmExtra = el('span', 'alarm-extra', alarmRow);

  const scoreBox = el('div', 'hud-box txt score', top);
  const scoreText = el('div', '', scoreBox);
  const coinRow = el('div', 'coins', scoreBox);
  el('div', 'coin-icon', coinRow);
  const coinText = el('span', '', coinRow, '0');

  const combo = el('div', 'combo txt', layer);
  const comboMultEl = el('div', 'mult', combo);
  const comboCount = el('div', 'count', combo);
  const comboFill = el('i', '', el('div', 'bar', combo));

  // Kart Rally: lap, time left and (alone) the next medal, top centre
  const raceBox = el('div', 'hud-box race txt', layer);
  const raceMain = el('div', '', raceBox);
  const raceSub = el('div', 'sub', raceBox);
  let wasRace = false;
  // Lane Defense: the cabinet's health
  const laneBar = el('div', 'bar', raceBox);
  const laneFill = el('i', '', laneBar);
  let wasLane = false;
  let wasMaze = false;
  let lastLeakToast = -1e9;
  const holdBox = el('div', 'hold txt', layer);
  const holdText = el('div', '', holdBox);
  const holdFill = el('i', '', el('div', 'bar', holdBox));

  const toasts = el('div', 'toasts', layer);

  const shopBox = el('div', 'shop txt', layer);
  const shopTitle = el('h2', '', shopBox);
  const shopTimer = el('div', 'sub', shopBox);
  const shopList = el('div', 'shop-list', shopBox);
  const shopReady = el('button', 'btn alt', shopBox, t('shop.ready'));
  shopReady.addEventListener('mousedown', e => {
    e.preventDefault();
    onShop.ready();
  });
  let shopKey = '';

  const bottom = el('div', 'hud-bottom', layer);
  const left = el('div', 'hud-box player-hp txt', bottom, '♥ HP ');
  // the number too: a bar alone says "about half", a shooter wants "47"
  const hpNumber = el('span', 'hp-number', left);
  const hpFill = el('i', '', el('div', 'bar', left));
  const dashRow = el('div', 'dashes', left);
  const jetBox = el('div', 'kart', left);
  el('div', 'sub', jetBox, t('hud.jetpack'));
  const jetFill = el('i', '', el('div', 'bar jet', jetBox));
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

  const rareSlot = el('div', 'slot rare txt', weaponRow);
  el('div', 'key', rareSlot, 'Q');
  const rareGlyph = el('div', 'glyph', rareSlot);
  const rareTime = el('div', 'timer', rareSlot);
  const mapBox = el('div', 'hud-box mapbox', bottom);
  const minimap = createMinimap(mapBox);

  const bossBox = el('div', 'boss txt', layer);
  const bossName = el('div', '', bossBox);
  const bossBar = el('div', 'bar', bossBox);
  const bossFill = el('i', '', bossBar);
  for (const f of [0.66, 0.33]) el('div', 'mark', bossBar).style.left = `${f * 100}%`;
  const hint = el('div', 'hint txt', layer);
  // fills while E is held at a nest, so you can see the charge going in
  const plantBar = el('div', 'plant-bar', layer);
  const plantFill = el('div', 'plant-fill', plantBar);
  const down = el('div', 'down txt', layer);
  const danger = el('div', 'danger', layer);

  let lastCoins = -1;
  let lastAlarm = 0;
  let lastWeaponsKey = '';
  let lastDash = '';

  function toast(text: string, kind: '' | 'warn' | 'good' | 'final' = '') {
    const e = el('div', `toast txt ${kind}`, toasts, text);
    setTimeout(() => e.remove(), kind === 'final' ? 3900 : 1900);
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
    setPadMode(useButton) {
      padMode = useButton;
    },
    update(s, events, buildMenuOpen, time, localId) {
      // versus: the messages are smaller and sit under the score, out of the line of fire (see ui.css)
      document.body.classList.toggle('versus', !!s.versus);
      const p = s.players.find(x => x.id === localId) ?? s.players[0];

      const lives = p.lives ?? s.credits;
      const most = Math.max(DIFFICULTY[s.difficulty].credits, lives);
      creditEls.forEach((c, i) => {
        c.classList.toggle('on', i < lives);
        c.style.display = i < most ? '' : 'none';
      });
      const mates = s.versus ? [] : s.players.filter(o => o !== p);
      teamText.textContent = mates.map(o => `${o.name} ${o.out ? t('hud.out') : '♥'.repeat(o.lives ?? 0)}`).join(' · ');
      teamText.style.display = mates.length ? '' : 'none';
      // out of lives: watching a teammate until the next floor
      const watching = p.out ? s.players.find(o => !o.out) : undefined;
      outBanner.style.display = p.out && s.phase === 'playing' ? '' : 'none';
      if (p.out) outBanner.textContent = t('hud.outBanner', { name: watching?.name ?? '' });
      const alive = s.nests.filter(n => n.state !== 'destroyed').length;
      // (a boss fight needs no line here: the boss bar and the countdown say it, and the box stays small)
      const nestsLine = s.nests.length > 0 ? t('hud.nests', { n: s.nests.length - alive, total: s.nests.length }) : '';
      const def = floorDef(s.map.id);
      // nests and floor on one line (the floor's name is in the countdown), so the box stays small
      const floorLine = s.run.mode === 'run' ? t('hud.floor', { n: s.run.floor + 1, total: s.run.floors.length }) : '';
      nestText.textContent = [nestsLine, floorLine].filter(Boolean).join(' · ');
      floorText.textContent = '';
      void def;

      const shop = s.run.stage === 'shop' ? s.run.shop : null;
      shopBox.style.display = shop ? '' : 'none';
      if (shop) {
        const offers = shop.offers[p.id] ?? [];
        const ready = shop.ready.includes(p.id);
        shopTimer.textContent = t('shop.timer', { s: Math.max(0, Math.ceil((s.run.stageUntil - s.tick) / TICK_RATE)), coins: p.coins, ready: shop.ready.length, total: s.players.length });
        const key = JSON.stringify([offers, ready, p.coins, shop.creditSold]);
        if (key !== shopKey) {
          shopKey = key;
          shopTitle.textContent = t('shop.title', { n: s.run.floor + 2 });
          shopList.innerHTML = '';
          offers.forEach((o, i) => {
            const card = el('div', `card shop-card${o.sold ? ' sold' : ''}${p.coins < o.cost || (o.kind === 'credit' && shop.creditSold) ? ' poor' : ''}`, shopList);
            el('div', 'key', card, String(i + 1));
            const label = o.kind === 'weapon' ? t('shop.weapon', { name: t(`weapon.${o.weapon!}`) }) : o.kind === 'perk' ? t(`perk.${o.perk!}`) : t(o.kind === 'heal' ? 'shop.heal' : 'shop.credit');
            el('div', 'name', card, label);
            el('div', 'cost', card, o.sold ? t('shop.sold') : `● ${o.cost}`);
            card.addEventListener('mousedown', e => {
              e.preventDefault();
              onShop.buy(i);
            });
          });
          shopReady.textContent = ready ? t('shop.waiting') : t('shop.ready');
        }
      }
      alarmEls.forEach((a, i) => a.classList.toggle('on', i < s.alarm.level));
      alarmExtra.textContent = s.alarm.level > ALARM_MAX ? `+${s.alarm.level - ALARM_MAX}` : '';
      alarmBox.classList.toggle('overload', s.alarm.level >= ALARM_MAX);
      // only floors with nests have an alarm
      alarmBox.style.display = s.run.stage === 'floor' && s.nests.length > 0 ? '' : 'none';
      // in versus the score is the race at the top; the box keeps only the coins (for towers)
      // the score only where it is the goal (Endless); everywhere else the box is one line of coins, and the
      // score is on the result screen
      const showScore = !s.versus && s.run.mode === 'endless';
      scoreText.textContent = showScore ? t('hud.score', { score: s.score }) : '';
      scoreText.style.display = showScore ? '' : 'none';
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
        const inside = inZone(s.map, nest.pos, p.pos) && p.downUntil === null;
        holdText.textContent = t(inside ? 'hud.hold' : 'hud.holdAway', { pct });
        holdBox.classList.toggle('away', !inside);
        holdFill.style.width = `${pct}%`;
      }

      hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;
      hpNumber.textContent = String(Math.max(0, Math.ceil(p.hp)));
      // colour-blind mode: the bar also darkens from light blue to dark orange as health drops
      hpFill.style.background = isColorBlind() ? cssColor(palette().health(p.hp / p.maxHp)) : '';
      // green is fine, orange is getting dangerous, red is critical
      hpFill.dataset.level = hpLevel(p.hp / p.maxHp);
      danger.style.display = p.hp < 30 && p.downUntil === null && s.phase === 'playing' ? '' : 'none';
      const dashKey = `${p.dashCharges}/${maxDashCharges(p)}`;
      if (dashKey !== lastDash) {
        lastDash = dashKey;
        dashRow.innerHTML = '';
        for (let i = 0; i < maxDashCharges(p); i++) el('i', i < p.dashCharges ? 'on' : '', dashRow);
      }
      const kart = p.vehicleId !== null ? s.vehicles.find(v => v.id === p.vehicleId) : undefined;
      // the rally's karts never run dry or break down: no gauges there
      kartBox.style.display = kart && s.run.stage !== 'race' ? '' : 'none';
      if (kart) {
        fuelFill.style.width = `${(kart.fuel / KART.fuelTicks) * 100}%`;
        // race karts never run dry
        (fuelFill.parentElement!.previousElementSibling as HTMLElement).style.display = kart.locked ? 'none' : '';
        fuelFill.parentElement!.style.display = kart.locked ? 'none' : '';
        kartFill.style.width = `${Math.max(0, kart.hp / KART.hp) * 100}%`;
      }

      jetBox.style.display = p.jetpack ? '' : 'none';
      jetFill.style.width = `${(p.jetFuel / JETPACK.fuelTicks) * 100}%`;
      rareSlot.style.display = p.rare ? '' : 'none';
      if (p.rare) {
        rareGlyph.textContent = RARE_GLYPH[p.rare.kind];
        const left = Math.max(0, Math.ceil((p.rare.until - s.tick) / TICK_RATE));
        rareTime.textContent = `${left}s`;
        rareSlot.classList.toggle('selected', p.rareSelected);
        rareSlot.classList.toggle('ending', left <= 10);
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
        sl.slot.classList.toggle('selected', !!w && i === p.selected && !p.rareSelected);
        if (!w) {
          // a weapon that is gone (a versus respawn) leaves an empty slot, not a ready one
          sl.slot.classList.remove('ready');
          sl.reload.style.width = '0%';
          return;
        }
        const ready = w.cooldown === 0;
        sl.slot.classList.toggle('ready', ready);
        sl.reload.style.width = `${(1 - Math.min(1, w.cooldown / WEAPONS[w.kind].cooldown)) * 100}%`;
      });

      // with a controller the hints name its button instead of the use key
      const useHint = (key: StringKey, params?: Record<string, string | number>) => t(key, padMode ? { ...params, 'key.use': padMode } : params);
      let hintText = '';
      if (p.downUntil === null && !buildMenuOpen) {
        const pad = padAt(s, p.pos);
        const padTower = pad === null ? undefined : s.towers.find(tw => tw.padId === pad);
        if (p.vehicleId !== null) hintText = kart?.locked ? '' : useHint('hud.leave');
        else if (s.nests.some(n => n.state === 'idle' && dist(n.pos, p.pos) <= PLANT_RANGE)) hintText = useHint('hud.plant');
        else if (s.vehicles.some(v => v.driverId === null && dist(v.pos, p.pos) <= KART.enterRange)) hintText = useHint('hud.drive');
        else if (padTower && padTower.buildLeft > 0) hintText = useHint('hud.building', { pct: Math.floor((1 - padTower.buildLeft / (padTower.upgrading ? UPGRADE_TICKS : BUILD_TICKS)) * 100) });
        else if (padTower && padTower.hp < padTower.maxHp) hintText = useHint('hud.repair', { pct: Math.floor((padTower.hp / padTower.maxHp) * 100) });
        else if (padTower && padTower.level < MAX_TOWER_LEVEL) hintText = useHint('hud.upgrade');
        else if (pad !== null && !padTower) hintText = useHint('hud.build');
        else if (s.elevatorOpen) hintText = t('hud.goElevator');
        else if (tileAt(s.map, p.pos.x, p.pos.z) === Tile.Hazard) hintText = t('hud.glitchFloor');
        else if (tileAt(s.map, p.pos.x, p.pos.z) === Tile.Boost) hintText = t('hud.boostFloor');
      }
      const planting = p.plantTicks > 0 && hintText === useHint('hud.plant');
      if (planting) hintText = useHint('hud.planting');
      hint.textContent = hintText;
      hint.style.display = hintText ? '' : 'none';
      hint.classList.toggle('steady', planting);
      plantBar.style.display = planting ? '' : 'none';
      plantFill.style.width = `${Math.min(1, p.plantTicks / PLANT_TICKS) * 100}%`;

      if (p.downUntil !== null && s.phase === 'playing') {
        down.style.display = '';
        // last cube standing: out for the rest of the round
        // out of lives, or waiting for a teammate's help: no countdown to show
        const waiting = p.out || p.downUntil > s.tick + 3600;
        down.textContent = s.versus?.rule === 'rounds' ? t('versus.out') : waiting ? (p.out ? t('hud.out') : t('hud.downWait')) : t('hud.down', { s: Math.max(0, Math.ceil((p.downUntil - s.tick) / TICK_RATE)) });
      } else {
        down.style.display = 'none';
      }

      for (const e of events) {
        switch (e.type) {
          case 'alarmChanged':
            // only a rising alarm is a warning; a destroyed nest lowers it and gets its own message
            if (e.level > lastAlarm) toast(e.level >= ALARM_MAX ? t('toast.overload') : t('toast.alarm', { level: e.level }), 'warn');
            lastAlarm = e.level;
            break;
          case 'nestAppeared':
            toast(t('toast.nestBack'), 'warn');
            break;
          case 'bossSpawn':
            // (he does not arrive, he joins)
            if (e.kind === 'dominik') toast(t('toast.dominikJoined'), 'final');
            else if (isFinalFloor(s)) toast(t('toast.finalBoss', { name: bossLabel(e.kind) }), 'final');
            else toast(t('toast.boss', { name: bossLabel(e.kind) }), 'warn');
            break;
          case 'dominikJoined':
            toast(t('toast.dominikJoined'), 'warn');
            break;
          case 'dominikLeft':
            toast(t('toast.dominikLeft'), 'good');
            break;
          case 'mazePower':
            toast(t('maze.power'), 'good');
            break;
          case 'mazeGhost':
            if (e.playerId === p.id) toast(t('maze.ghost', { coins: MAZE.ghostCoins }), 'good');
            break;
          case 'mazeCaught':
            if (e.playerId === p.id) toast(t('maze.caught'), 'warn');
            break;
          case 'mazeEnd':
            toast(t(e.cleared ? 'maze.cleared' : 'maze.end'), 'final');
            break;
          case 'laneLeak':
            if (time - lastLeakToast > 2) {
              lastLeakToast = time;
              toast(t('lane.leak'), 'warn');
            }
            break;
          case 'laneEnd':
            toast(e.coreLeft > 0 ? t('lane.end', { pct: Math.round(e.coreLeft * 100), coins: e.coins }) : t('lane.lost'), e.coreLeft > 0 ? 'final' : 'warn');
            break;
          case 'coinOpRule':
            toast(t(`coinop.${e.rule}` as 'coinop.turbo'), 'final');
            break;
          case 'gunLevel':
            if (e.playerId === p.id) toast(t('toast.gunLevel', { weapon: t(`weapon.${e.weapon}` as 'weapon.bomb') }), 'good');
            break;
          case 'pvpKill': {
            const name = (id: number | null) => s.players.find(x => x.id === id)?.name ?? '';
            const mine = e.killerId === p.id || e.victimId === p.id;
            toast(e.killerId === null ? t('versus.selfKill', { victim: name(e.victimId) }) : t('versus.kill', { killer: name(e.killerId), victim: name(e.victimId) }), e.victimId === p.id ? 'warn' : mine ? 'good' : '');
            break;
          }
          case 'versusRound': {
            const winner = e.winner === null ? null : s.versus?.mode === 'team' ? t(e.winner === 0 ? 'versus.red' : 'versus.blue') : (s.players.find(x => x.id === e.winner)?.name ?? '');
            toast(winner === null ? t('versus.roundDraw', { round: e.round }) : t('versus.roundWon', { name: winner, round: e.round }), 'final');
            break;
          }
          case 'cubeTaken':
            toast(t('versus.cubeTaken', { name: s.players.find(x => x.id === e.playerId)?.name ?? '', team: t(e.team === 0 ? 'versus.redCube' : 'versus.blueCube') }), e.team === p.team ? 'warn' : 'good');
            break;
          case 'cubeDropped':
            toast(t('versus.cubeDropped', { team: t(e.team === 0 ? 'versus.redCube' : 'versus.blueCube') }));
            break;
          case 'cubeReturned':
            toast(t('versus.cubeReturned', { team: t(e.team === 0 ? 'versus.redCube' : 'versus.blueCube') }));
            break;
          case 'cubeCaptured':
            toast(t('versus.cubeCaptured', { team: t(e.team === 0 ? 'versus.red' : 'versus.blue') }), 'final');
            break;
          case 'kingMoved':
            toast(t('versus.kingMoved'), 'warn');
            break;
          case 'versusEnd': {
            const team = s.versus?.mode === 'team' ? s.players.find(x => x.id === e.winners[0])?.team : undefined;
            const names = e.winners.map(id => s.players.find(x => x.id === id)?.name ?? '').join(' & ');
            toast(team !== undefined ? t('versus.teamWon', { team: t(team === 0 ? 'versus.red' : 'versus.blue') }) : t('versus.won', { name: names || '–' }), 'final');
            break;
          }
          case 'raceLap':
            if (e.playerId === p.id) toast(t('race.lap', { lap: e.lap }), 'good');
            break;
          case 'raceEnd':
            if (e.medal) toast(t(`race.medal.${e.medal}` as 'race.medal.gold'), 'final');
            else if (e.winners.length === 1) toast(t('race.winner', { name: s.players.find(x => x.id === e.winners[0])?.name ?? '' }), 'final');
            else toast(t('race.end'), 'good');
            break;
          case 'floorStart':
            toast(t('toast.floor', { n: e.floor + 1, name: t((floorDef(e.mapId)?.name ?? 'floor.plaza') as 'floor.plaza') }), 'good');
            break;
          case 'bought':
            if (e.playerId === p.id) toast(t('toast.bought'), 'good');
            break;
          case 'towerDestroyed':
            toast(t('toast.towerDown'), 'warn');
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
            if (e.credits > 0 && (e.playerId === undefined || e.playerId === p.id)) toast(t('toast.creditLost', { credits: e.credits }), 'warn');
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
            toast(e.card.type === 'rare' ? t('toast.rare', { name: t(`rare.${e.card.rare}`) }) : t('toast.card', { name: e.card.type === 'weapon' ? t(`weapon.${e.card.weapon}`) : t(`perk.${e.card.perk}`), level: e.level }), 'good');
            break;
          case 'comboUp':
            bump(combo);
            break;
          case 'unicornAppeared':
            toast(t('toast.unicorn'), 'good');
            break;
          case 'jetpackPicked':
            if (e.playerId === p.id) toast(t('toast.jetpack'), 'good');
            break;
          case 'logoEgg':
            toast(t(e.prize === 'nothing' ? 'toast.eggNothing' : 'toast.egg'), e.prize === 'nothing' ? 'warn' : 'final');
            break;
          case 'heartFound':
            toast(t('toast.heart', { name: s.players.find(x => x.id === e.playerId)?.name ?? '' }), 'final');
            break;
          case 'playerOut':
            if (e.playerId !== p.id) toast(t('toast.out', { name: s.players.find(x => x.id === e.playerId)?.name ?? '' }), 'warn');
            break;
          case 'jetpackEmpty':
            if (e.playerId === p.id) toast(t('toast.jetpackEmpty'));
            break;
        }
      }

      const vs = s.versus;
      // the countdown that opens a game (what is played, then 5 4 3 2 1 GO!), and GO! for a moment after it
      const counting = (s.countdown ?? 0) > 0;
      if (counting) goUntil = performance.now() + 900;
      const showIntro = counting || performance.now() < goUntil;
      intro.style.display = showIntro ? '' : 'none';
      if (showIntro) {
        const mode = s.run.mode;
        const floorName = t(FLOORS[s.map.id]?.name as 'floor.plaza');
        const level = t(`difficulty.${s.difficulty}` as 'difficulty.medium');
        if (vs) {
          introRule.textContent = t(`versus.${vs.rule}` as 'versus.score');
          introMode.textContent = [vs.rule === 'capture' || vs.rule === 'gungame' ? '' : t(`versus.${vs.mode}` as 'versus.ffa'), floorName, vs.chaos ? t('versus.chaosCard') : ''].filter(Boolean).join(' · ');
          introHint.textContent = t(`versus.${vs.rule}Hint` as 'versus.scoreHint');
        } else if (mode === 'brawl') {
          introRule.textContent = t('brawl.title');
          introMode.textContent = `${level} · ${floorName}`;
          introHint.textContent = t('brawl.sub');
        } else if (mode === 'bossrush') {
          introRule.textContent = t('bossrush.title');
          introMode.textContent = `${level} · ${floorName}`;
          introHint.textContent = t('bossrush.sub');
        } else {
          introRule.textContent = t(mode === 'run' ? 'mode.run' : mode === 'endless' ? 'mode.endless' : 'mode.quick');
          introMode.textContent = mode === 'run' ? t('intro.floor', { level, n: s.run.floor + 1, of: s.run.floors.length, name: floorName }) : `${level} · ${floorName}`;
          introHint.textContent = t(mode === 'run' ? 'mode.runHint' : mode === 'endless' ? 'mode.endlessHint' : 'mode.quickHint');
        }
        const shown = counting ? String(Math.ceil(s.countdown! / TICK_RATE)) : t('versus.go');
        if (shown !== introShown) {
          introShown = shown;
          introCount.textContent = shown;
          // restart the pop for every number
          introCount.classList.remove('pop');
          void introCount.offsetWidth;
          introCount.classList.add('pop');
        }
        intro.classList.toggle('going', !counting);
      } else introShown = '';
      if (vs) {
        const left = Math.max(0, Math.ceil((vs.endsAt - s.tick) / TICK_RATE));
        const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        const me = vs.scores[p.id] ?? 0;
        if (vs.rule === 'rounds') {
          const mine = vs.mode === 'team' ? (vs.roundWins[p.team ?? 0] ?? 0) : (vs.roundWins[p.id] ?? 0);
          raceMain.textContent = t('versus.hudRounds', { round: vs.round, me: mine, best: Math.max(0, ...Object.values(vs.roundWins)) });
        } else if (vs.rule === 'gungame') {
          const held = p.weapons[0]?.kind;
          raceMain.textContent = t('versus.hudGun', { me: me + 1, n: vs.limit, weapon: held ? t(`weapon.${held}` as 'weapon.bomb') : '', lead: Math.max(0, ...Object.values(vs.scores)) + 1, time });
        } else if (vs.mode === 'team') raceMain.textContent = t('versus.hudTeam', { red: vs.teamScores[0], blue: vs.teamScores[1], time });
        else raceMain.textContent = t('versus.hudFfa', { me, lead: Math.max(0, ...Object.values(vs.scores)), time });
        raceSub.textContent = vs.coinop ? t('versus.hudCoinOp', { rule: t(`coinop.${vs.coinop.rule}` as 'coinop.turbo') }) : vs.rule === 'score' ? t('versus.limit', { n: vs.limit }) : '';
      }
      const race = s.run.stage === 'race' ? s.run.race : null;
      const lane = s.run.stage === 'lane' ? s.run.lane : null;
      const maze = s.run.stage === 'maze' ? s.run.maze : null;
      raceBox.style.display = race || lane || maze || vs ? '' : 'none';
      // versus has no credits, nests or alarm: the whole panel goes
      runBox.style.display = vs ? 'none' : '';
      if (maze && !wasMaze) toast(t('maze.start'), 'final');
      wasMaze = !!maze;
      if (maze) {
        const left = Math.max(0, Math.ceil((s.run.stageUntil - s.tick) / TICK_RATE));
        raceMain.textContent = t('maze.hud', { left: maze.pixels.length, time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
        raceSub.textContent = t('maze.mine', { n: maze.collected[p.id] ?? 0 });
      }
      laneBar.style.display = lane ? '' : 'none';
      if (lane && !wasLane) toast(t('lane.start'), 'final');
      wasLane = !!lane;
      if (lane) {
        const left = Math.max(0, Math.ceil((s.run.stageUntil - s.tick) / TICK_RATE));
        raceMain.textContent = t('lane.hud', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
        raceSub.textContent = '';
        laneFill.style.width = `${(lane.coreHp / LANE.coreHp) * 100}%`;
      }
      if (race && !wasRace) toast(t('race.start'), 'final');
      wasRace = !!race;
      if (race) {
        const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
        const seconds = raceSeconds(s);
        const done = race.laps[p.id] ?? 0;
        raceMain.textContent = t('race.hud', { lap: Math.min(done + 1, RACE.laps), laps: RACE.laps, time: clock(seconds) });
        // alone: the best medal still in reach, and the time to beat for it
        const medal = s.players.length === 1 ? (['gold', 'silver', 'bronze'] as const).find(m => seconds <= RACE.medals[m].seconds) : undefined;
        raceSub.textContent = medal ? t('race.next', { medal: t(`medal.${medal}` as 'medal.gold'), time: clock(RACE.medals[medal].seconds) }) : '';
      }

      // the boss bar and the zone bar sit above the weapon bar; hints move up to make room
      layer.classList.toggle('has-bar', !!s.boss || holdBox.style.display === '');
      if (s.boss) {
        bossBox.style.display = '';
        // a brawl: the bosses of the wave share the bar, with both names
        const all = allBosses(s);
        const name = all.map(b => bossLabel(b.kind)).join(' + ');
        bossName.textContent = isFinalFloor(s) ? t('boss.final', { name }) : name;
        bossBox.classList.toggle('final', isFinalFloor(s));
        bossFill.style.width = `${Math.max(0, bossHp(s) / all.reduce((n, b) => n + b.maxHp, 0)) * 100}%`;
      } else bossBox.style.display = 'none';
      minimap.update(s, time, p.id);
    },
  };
}
