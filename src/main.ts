import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, type MusicPlayer } from './audio/music';
import { soundsForEvent } from './audio/sfx';
import { t } from './i18n';
import { Keyboard } from './input/keyboard';
import { PadControls, PadMenu, type PadSnapshot } from './input/gamepad';
import { createLoop } from './loop';
import { createLan, type Lan } from './net/lan';
import type { LobbyPlayer } from './net/protocol';
import { ClientSession, HostSession } from './net/session';
import { createRenderer } from './render/renderer';
import { buildRunLog, saveRunLog } from './runlog';
import { floor01 } from './sim/config/floor01';
import { createSim, stepSim } from './sim/sim';
import { totalKills } from './sim/systems/stats';
import { loadProfile, saveProfile, ticketsForRun } from './profile';
import { TICK_RATE, type RunMode, type Command, type RareKind, type SimEvent, type SimState, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
import { createMarkers } from './ui/markers';
import { createUpdateBanner } from './ui/update-banner';
import { createScreens, loadSettings, recordScore, saveSettings, type JoinEntry, type RunSummary } from './ui/screens';

document.title = t('title');
const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);

if (params.has('sound')) {
  void import('./audio/soundboard').then(m => m.showSoundboard(app));
} else {
  startGame();
}

const randomSeed = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

function startGame() {
  app.innerHTML = '<canvas id="game"></canvas>';
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const renderer = createRenderer(canvas, floor01);
  const keyboard = new Keyboard();
  // Xbox-style controllers: one drives the player (it takes over as soon as it is touched), any navigates menus
  const padCtl = new PadControls();
  const padMenus = [new PadMenu(), new PadMenu()];
  let padActive = false;
  const readPads = (): PadSnapshot[] => (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected);
  const padTouched = (g: PadSnapshot) => g.buttons.some(b => b.pressed) || g.axes.some(a => Math.abs(a) > 0.3);
  const settings = loadSettings();
  const profile = loadProfile(window.localStorage);
  const storeProfile = () => saveProfile(window.localStorage, profile);
  const forced = params.get('graphics');
  if (forced === 'low' || forced === 'medium' || forced === 'high' || forced === 'ultra') settings.graphics = forced;

  /** solo: this sim; LAN: whatever the host or the snapshots show */
  let solo: SimState = createSim(floor01, 1);
  let role: 'solo' | 'host' | 'client' = 'solo';
  let host: HostSession | null = null;
  let client: ClientSession | null = null;
  let lan: Lan | null = null;
  let stopDiscovery: (() => void) | null = null;
  let mode: 'title' | 'playing' | 'paused' | 'over' | 'lobby' = 'title';
  let frameEvents: SimEvent[] = [];
  let lastLobby = '';
  const mouse = { x: innerWidth / 2, y: innerHeight / 3 };
  let audio: { ctx: AudioContext; mixer: Mixer; music: MusicPlayer } | null = null;

  // dev only (?bot=1): the test bot plays, e.g. to record gameplay
  let bot: ((s: SimState) => Command[]) | null = null;
  if (import.meta.env.DEV && params.has('bot')) void import('../tests/sim/bot').then(m => (bot = m.createBot()));

  const view = (): SimState => (role === 'host' ? host?.sim : role === 'client' ? client?.view : null) ?? solo;
  const localId = () => (role === 'client' ? (client?.playerId ?? 0) : 0);

  function ensureAudio() {
    if (!audio) {
      const ctx = new AudioContext();
      const mixer = createMixer(ctx);
      audio = { ctx, mixer, music: createMusic(ctx, mixer.musicBus) };
      applySettings();
    }
    void audio.ctx.resume();
    return audio;
  }

  function applySettings() {
    audio?.mixer.setMusicVolume(settings.music);
    audio?.mixer.setSfxVolume(settings.sfx);
    keyboard.steerWithMouse = settings.steerWithMouse;
    renderer.setQuality(settings.graphics);
    renderer.setDamageNumbers(settings.damageNumbers);
  }
  applySettings();

  const playerName = () => settings.name || 'Player';

  const lanActions = {
    start: () => {
      if (!host) return;
      host.start(Number(params.get('seed')) || randomSeed(), host.difficulty);
      enterPlay();
    },
    leave: () => leaveLan(),
    setDifficulty: (d: SimState['difficulty']) => {
      host?.setDifficulty(d);
      settings.difficulty = d;
      saveSettings(settings);
    },
    connect: (target: string) => void joinGame(target),
  };

  createUpdateBanner(app, window.cubeCrashers?.updates, () => ensureAudio().mixer.play('uiClick'));
  // HUD layers: the left one fills the window, in split screen each player gets a half
  const hudRoots = (['left', 'right'] as const).map(side => {
    const d = document.createElement('div');
    d.className = `hud-root ${side}`;
    app.append(d);
    return d;
  });
  const markers = createMarkers(hudRoots[0]);
  const hud = createHud(hudRoots[0], { buy: i => keyboard.buy(i), ready: () => keyboard.ready() });
  const buildMenu = createBuildMenu(hudRoots[0], kind => keyboard.chooseTower(kind));
  const markers2 = createMarkers(hudRoots[1]);
  const hud2 = createHud(hudRoots[1], { buy: () => {}, ready: () => {} });
  const buildMenu2 = createBuildMenu(hudRoots[1], () => {});
  const padCtl2 = new PadControls();
  let split = false;
  /** Z zooms player 1's view out (R3 on the controller does the same) */
  let zoomedOut = false;
  const setSplit = (on: boolean) => {
    split = on;
    document.body.classList.toggle('split', on);
  };
  const setHudVisible = (v: boolean) => {
    hud.setVisible(v);
    hud2.setVisible(v && split);
  };
  const screens = createScreens(
    app,
    {
      play: () => newSoloGame('run'),
      quick: () => newSoloGame('quick'),
      endless: () => newSoloGame('endless'),
      host: () => void hostGame(),
      join: () => void openJoinList(),
      resume,
      mainMenu: toTitle,
      quit: () => window.close(),
      settingsChanged: applySettings,
      click: () => ensureAudio().mixer.play('uiClick'),
    },
    settings,
    profile,
    storeProfile,
  );

  const loop = createLoop(
    () => {
      if (mode !== 'playing' && !(mode === 'paused' && role !== 'solo')) return;
      const s = view();
      if (s.phase !== 'playing') return;
      keyboard.setAim(mode === 'playing' ? renderer.groundPoint(mouse.x, mouse.y) : null);
      const now = performance.now();
      const pads = readPads();
      // split screen: with two controllers each player has one, with one controller it belongs to player 2
      const pad = split ? (pads.length >= 2 ? pads[0] : undefined) : pads[0];
      const pad2 = split ? (pads.length >= 2 ? pads[1] : pads[0]) : undefined;
      if (pad && padTouched(pad)) padActive = true;
      let cmds = mode !== 'playing' ? [] : bot && role === 'solo' ? bot(s) : keyboard.commands(s, localId(), now);
      // the controller's commands come last, so its move and aim win while it is in use
      if (mode === 'playing' && pad && padActive && !bot) cmds = [...cmds, ...padCtl.commands(pad, s, localId(), now)];
      if (mode === 'playing' && split && pad2) cmds = [...cmds, ...padCtl2.commands(pad2, s, 1, now)];
      if (role === 'solo') {
        stepSim(s, cmds);
        keyboard.onEvents(s.events);
        padCtl.onEvents(s.events);
        padCtl2.onEvents(s.events);
        frameEvents.push(...s.events);
      } else if (role === 'host') {
        host!.step(cmds);
      } else {
        client!.sendInput(cmds);
      }
    },
    (alpha, frameDt) => {
      if (role === 'host' && host) {
        const evs = host.takeEvents();
        keyboard.onEvents(evs);
        frameEvents.push(...evs);
        announce();
      }
      if (role === 'client' && client) {
        client.checkTimeout(performance.now());
        const evs = client.takeEvents();
        keyboard.onEvents(evs);
        frameEvents.push(...evs);
        watchClient();
      }
      if (role === 'host' && mode === 'lobby') watchHostLobby();

      const s = view();
      // the crosshair replaces the mouse pointer while playing
      canvas.style.cursor = mode === 'playing' && view().run.stage === 'floor' ? 'none' : '';
      renderer.setViews(split ? [0, 1] : [localId()]);
      renderer.setZoomedOut(0, zoomedOut !== padCtl.zoomedOut);
      if (split) renderer.setZoomedOut(1, padCtl2.zoomedOut);
      renderer.setLookAhead(0, padActive);
      if (split) renderer.setLookAhead(1, true);
      renderer.render(s, alpha, frameEvents, frameDt);
      const menuOpen = padActive ? padCtl.buildMenuOpen : keyboard.buildMenuOpen;
      hud.setPadMode(padActive);
      buildMenu.setPadLabels(padActive);
      hud2.setPadMode(true);
      buildMenu2.setPadLabels(true);
      hud.update(s, frameEvents, menuOpen, performance.now() / 1000, localId());
      markers.setVisible(mode === 'playing' || mode === 'paused');
      if (mode === 'playing') markers.update(s, renderer.project);
      buildMenu.update(s, menuOpen && mode === 'playing', frameEvents, localId(), padActive ? padCtl.menuPad : keyboard.menuPad);
      if (split) {
        hud2.update(s, frameEvents, padCtl2.buildMenuOpen, performance.now() / 1000, 1);
        buildMenu2.update(s, padCtl2.buildMenuOpen && mode === 'playing', frameEvents, 1, padCtl2.menuPad);
        if (mode === 'playing') markers2.update(s, (x, z) => {
          const r = renderer.project(x, z, 1);
          return { x: r.x - hudRoots[1].getBoundingClientRect().left, y: r.y };
        });
      }
      markers2.setVisible(split && (mode === 'playing' || mode === 'paused'));
      if (audio) {
        for (const e of frameEvents) for (const snd of soundsForEvent(e)) audio.mixer.play(snd.id, snd.pitch);
        for (const e of frameEvents) {
          if (e.type === 'alarmChanged') audio.music.playTrack(e.level >= 5 ? 'boss' : 'battle');
          if (e.type === 'gameWon' || e.type === 'gameLost') audio.music.playTrack(null);
        }
      }
      for (const e of frameEvents) {
        if ((e.type === 'gameWon' || e.type === 'gameLost') && (mode === 'playing' || mode === 'paused')) finish(e.type === 'gameWon');
      }
      frameEvents = [];
    },
  );

  /** tickets for this run go into the local profile (in LAN games every player earns their own) */
  function earnTickets(s: SimState): number {
    const floors = s.run.floor + (s.phase === 'won' ? 1 : 0);
    const n = ticketsForRun({ score: s.score, floors, difficulty: s.difficulty });
    profile.tickets += n;
    storeProfile();
    return n;
  }

  function summary(s: SimState): RunSummary {
    return {
      score: s.score,
      seconds: s.tick / TICK_RATE,
      kills: totalKills(s),
      maxCombo: s.stats.maxCombo,
      credits: s.credits,
      nestsDestroyed: s.nests.filter(n => n.state === 'destroyed').length,
      nests: s.nests.length,
      best: recordScore(s.score, s.run.mode === 'endless' ? 'endless' : s.difficulty),
      tickets: earnTickets(s),
      difficulty: s.difficulty,
      ranking: [...s.players]
        .sort((a, b) => b.stats.score - a.stats.score)
        .map(p => ({ name: p.name, color: p.color, score: p.stats.score, kills: p.stats.kills, revives: p.stats.revives, downs: p.stats.downs, bestCombo: p.stats.bestCombo })),
    };
  }

  function finish(won: boolean) {
    mode = 'over';
    keyboard.releaseAll();
    const s = view();
    saveRunLog(buildRunLog(s));
    const result = summary(s);
    const again =
      role === 'host'
        ? { label: t('lobby.back'), action: () => backToLobby() }
        : role === 'client'
          ? { label: t('lobby.back'), action: () => backToLobby() }
          : undefined;
    setTimeout(() => {
      if (mode !== 'over') return;
      setHudVisible(false);
      screens.result(won, result, again);
    }, 1800);
  }

  function enterPlay() {
    frameEvents = [];
    keyboard.releaseAll();
    screens.hide();
    setHudVisible(true);
    mode = 'playing';
    loop.resume();
    ensureAudio().music.playTrack('battle');
  }

  let lastSoloMode: RunMode = 'run';
  function newSoloGame(mode: RunMode = lastSoloMode) {
    lastSoloMode = mode;
    leaveLan(false);
    role = 'solo';
    setSplit(settings.localPlayers === 2);
    const fixed = Number(params.get('seed'));
    const names = split ? [playerName(), t('split.player2')] : [playerName()];
    const colors = settings.color !== null ? (split ? [settings.color, (settings.color + 1) % 6] : [settings.color]) : undefined;
    solo = createSim(floor01, fixed > 0 ? fixed : randomSeed(), { mode, players: names.length, unlocked: profile.unlocked, difficulty: settings.difficulty, names, colors });
    if (params.has('demo')) applyDemo(solo);
    enterPlay();
  }

  // ---------- LAN ----------

  async function ensureLan(): Promise<Lan | null> {
    lan ??= await createLan();
    if (!lan) screens.notice(t('net.noLan'));
    return lan;
  }

  async function hostGame() {
    if (!(await ensureLan())) return;
    try {
      const transport = await lan!.host(playerName());
      leaveLan(false);
      role = 'host';
      setSplit(false);
      host = new HostSession(transport, { name: playerName(), color: settings.color, unlocked: profile.unlocked });
      host.setDifficulty(settings.difficulty);
      showLobby();
    } catch {
      screens.notice(t('net.failed'));
    }
  }

  async function openJoinList() {
    if (!(await ensureLan())) return;
    let games: JoinEntry[] = [];
    const draw = () => screens.joinList(games, lan!.canEnterAddress, lanActions);
    draw();
    stopDiscovery?.();
    stopDiscovery = lan!.discover(found => {
      const key = JSON.stringify(found);
      if (key === JSON.stringify(games)) return;
      games = found;
      if (mode === 'title') draw();
    });
  }

  async function joinGame(target: string) {
    stopDiscovery?.();
    stopDiscovery = null;
    try {
      const transport = await lan!.join(target);
      leaveLan(false);
      role = 'client';
      setSplit(false);
      client = new ClientSession(transport, { name: playerName(), color: settings.color, unlocked: profile.unlocked });
      mode = 'lobby';
      lastLobby = '';
    } catch {
      screens.notice(t('net.failed'));
    }
  }

  function showLobby() {
    mode = 'lobby';
    lastLobby = '';
    setHudVisible(false);
    if (role === 'host') watchHostLobby();
  }

  /** tells the network announcement how many are in and whether new players can still join */
  let lastAnnounce = '';
  function announce() {
    if (!host || !window.cubeCrashers?.lan) return;
    const next = { players: host.lobby.length, open: !host.sim && host.lobby.length < 6 };
    const key = JSON.stringify(next);
    if (key === lastAnnounce) return;
    lastAnnounce = key;
    window.cubeCrashers.lan.setInfo(next);
  }

  function watchHostLobby() {
    if (!host) return;
    announce();
    const key = JSON.stringify([host.lobby, host.difficulty]);
    if (key === lastLobby) return;
    lastLobby = key;
    screens.lobby(host.lobby, host.difficulty, true, 0, lanActions);
  }

  /** follows what the host does: lobby changes, the start of a run, the host leaving */
  function watchClient() {
    if (!client) return;
    if (client.status === 'rejected') {
      const reason = client.rejectReason ?? 'full';
      leaveLan(false);
      screens.notice(t(`net.rejected.${reason}` as 'net.rejected.full'));
      mode = 'title';
      return;
    }
    if (client.status === 'hostLeft') {
      leaveLan(false);
      setHudVisible(false);
      mode = 'title';
      screens.notice(t('net.hostLeft'));
      return;
    }
    const running = client.status === 'playing' && client.view?.phase === 'playing';
    // a new run started: join it from the lobby or straight from the result screen
    if (running && (mode === 'lobby' || mode === 'over')) {
      enterPlay();
      return;
    }
    if (mode === 'lobby' && !running) {
      const key = JSON.stringify([client.lobby, client.difficulty, client.status]);
      if (key === lastLobby) return;
      lastLobby = key;
      screens.lobby(client.lobby as LobbyPlayer[], client.difficulty, false, client.playerId, lanActions);
    }
  }

  function backToLobby() {
    if (role === 'host') host?.endRun();
    showLobby();
    if (role === 'client') watchClient();
  }

  function leaveLan(toTitleScreen = true) {
    stopDiscovery?.();
    stopDiscovery = null;
    host?.close();
    client?.leave();
    host = null;
    client = null;
    role = 'solo';
    if (toTitleScreen) toTitle();
  }

  // ---------- pause and menus ----------

  function resume() {
    if (mode !== 'paused') return;
    screens.hide();
    mode = 'playing';
    if (role === 'solo') loop.resume();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    keyboard.releaseAll();
    padCtl.releaseAll();
    padCtl2.releaseAll();
    // a LAN game keeps running for everyone else
    if (role === 'solo') loop.pause();
    screens.pause();
  }

  function toTitle() {
    if (role !== 'solo') leaveLan(false);
    mode = 'title';
    setSplit(false);
    solo = createSim(floor01, 1);
    setHudVisible(false);
    screens.title();
    if (audio) audio.music.playTrack('menu');
  }

  /** Controller in menus: d-pad or stick moves the focus, A presses, B goes back, Start pauses and resumes. */
  function pollPadMenus() {
    requestAnimationFrame(pollPadMenus);
    const all = readPads();
    if (all.length === 0) return;
    // any controller can pause and steer the menus
    const reads = all.slice(0, 2).map((g, i) => padMenus[i].read(g));
    const e = { up: false, down: false, left: false, right: false, a: false, b: false, start: false };
    for (const r of reads) for (const k of Object.keys(e) as (keyof typeof e)[]) e[k] ||= r[k];
    if (e.start) {
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing') return;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.screen button:not(:disabled)')].filter(b => b.offsetParent !== null);
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.up || e.left) buttons[at <= 0 ? buttons.length - 1 : at - 1].focus();
    if (e.down || e.right) buttons[at < 0 || at >= buttons.length - 1 ? 0 : at + 1].focus();
    if (e.a) (at >= 0 ? buttons[at] : buttons[0]).click();
    if (e.b) {
      if (mode === 'paused') resume();
      else buttons.find(b => b.textContent === t('menu.back'))?.click();
    }
  }
  requestAnimationFrame(pollPadMenus);

  addEventListener('keydown', e => {
    padActive = false;
    if (e.code === 'Space') e.preventDefault();
    // repeats of a held key are let through, so keys still held after a pause work again;
    // the keyboard only counts the first press for one-off actions
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.repeat) return;
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing' && e.code === 'KeyZ' && !e.repeat) zoomedOut = !zoomedOut;
    if (mode === 'playing') keyboard.keyDown(e.code, performance.now());
  });
  addEventListener('keyup', e => keyboard.keyUp(e.code, performance.now()));
  addEventListener('mousemove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) padActive = false;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && mode === 'playing') keyboard.mouseDown();
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) keyboard.mouseUp();
  });
  addEventListener('wheel', e => {
    if (mode === 'playing') keyboard.wheel(e.deltaY);
  }, { passive: true });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', () => (role === 'solo' ? pause() : keyboard.releaseAll()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && role === 'solo') pause();
  });
  addEventListener('pointerdown', () => {
    if (mode === 'title' && audio === null) ensureAudio().music.playTrack('menu');
  }, { once: true });
  addEventListener('beforeunload', () => leaveLan(false));

  setHudVisible(false);
  screens.title();
  // dev: ?split=1 starts the demo in split screen
  if (params.has('split')) settings.localPlayers = 2;
  if (params.has('demo')) newSoloGame(params.get('mode') === 'run' ? 'run' : 'quick');
  if (import.meta.env.DEV && params.has('capture')) {
    // dev only (?capture=1): time only moves when the recorder asks, so recordings are smooth
    let clock = 0;
    (window as unknown as { __advance: (ms: number) => void }).__advance = ms => loop.frame((clock += ms));
  } else {
    requestAnimationFrame(function frame(now) {
      loop.frame(now);
      requestAnimationFrame(frame);
    });
    // browsers stop animation frames for hidden windows; a LAN game must go on for the others
    setInterval(() => {
      if (document.hidden && role !== 'solo') loop.frame(performance.now());
    }, 1000 / 60);
  }
}

/** Dev helper (?demo=1|rare|nest&warp=ticks): armed player with coins. */
function applyDemo(sim: SimState) {
  const all: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'bananaMine', 'bomb', 'discoBall'];
  sim.players[0].weapons = all.map(kind => ({ kind, level: 2, cooldown: 0 }));
  sim.players[0].coins = 200;
  if (params.get('demo') === 'rare') {
    sim.players[0].jetFuel = 300;
    sim.players[0].rare = { kind: (params.get('kind') as RareKind) ?? 'slushMachine', until: sim.tick + 3600, cooldown: 0 };
    sim.players[0].rareSelected = true;
  }
  const floorParam = Number(params.get('floor'));
  if (floorParam > 0 && sim.run.mode === 'run') void import('./sim/systems/run').then(m => m.enterFloor(sim, Math.min(floorParam, sim.run.floors.length - 1)));
  if (params.get('demo') === 'shop' && sim.run.mode === 'run') void import('./sim/systems/shop').then(m => m.openShop(sim));
  if (params.get('demo') === 'nest') {
    // straight into a hold: next to a planted nest, with a crate opened beside it
    const nest = sim.nests[0];
    nest.state = 'planted';
    nest.progress = 500;
    nest.nextRushAt = 0;
    sim.players[0].pos = { x: nest.pos.x + 2, z: nest.pos.z + 2 };
    sim.players[0].invulnUntil = 1e9;
    sim.crates.push({ id: sim.nextId++, pos: { x: nest.pos.x + 2.5, z: nest.pos.z + 2 } });
    sim.alarm.level = Number(params.get('alarm') ?? 2);
  }
  const warp = Number(params.get('warp') ?? 0);
  for (let i = 0; i < warp; i++) stepSim(sim, []);
}
