import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, type MusicPlayer } from './audio/music';
import { soundsForEvent } from './audio/sfx';
import { t } from './i18n';
import { Keyboard } from './input/keyboard';
import { createLoop } from './loop';
import { createLan, type Lan } from './net/lan';
import type { LobbyPlayer } from './net/protocol';
import { ClientSession, HostSession } from './net/session';
import { createRenderer } from './render/renderer';
import { buildRunLog, saveRunLog } from './runlog';
import { floor01 } from './sim/config/floor01';
import { createSim, stepSim } from './sim/sim';
import { totalKills } from './sim/systems/stats';
import { TICK_RATE, type Command, type RareKind, type SimEvent, type SimState, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
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
  const settings = loadSettings();

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

  const hud = createHud(app);
  const buildMenu = createBuildMenu(app, kind => keyboard.chooseTower(kind));
  const screens = createScreens(
    app,
    {
      play: newSoloGame,
      host: () => void hostGame(),
      join: () => void openJoinList(),
      resume,
      mainMenu: toTitle,
      quit: () => window.close(),
      settingsChanged: applySettings,
      click: () => ensureAudio().mixer.play('uiClick'),
    },
    settings,
  );

  const loop = createLoop(
    () => {
      if (mode !== 'playing' && !(mode === 'paused' && role !== 'solo')) return;
      const s = view();
      if (s.phase !== 'playing') return;
      keyboard.setAim(mode === 'playing' ? renderer.groundPoint(mouse.x, mouse.y) : null);
      const cmds = mode !== 'playing' ? [] : bot && role === 'solo' ? bot(s) : keyboard.commands(s, localId(), performance.now());
      if (role === 'solo') {
        stepSim(s, cmds);
        keyboard.onEvents(s.events);
        frameEvents.push(...s.events);
      } else if (role === 'host') {
        host!.step(cmds);
      } else {
        client!.sendInput(cmds);
      }
    },
    (alpha, frameDt) => {
      if (role === 'host' && host) frameEvents.push(...host.takeEvents());
      if (role === 'client' && client) {
        const evs = client.takeEvents();
        keyboard.onEvents(evs);
        frameEvents.push(...evs);
        watchClient();
      }
      if (role === 'host' && mode === 'lobby') watchHostLobby();

      const s = view();
      // the crosshair replaces the mouse pointer while playing
      canvas.style.cursor = mode === 'playing' ? 'none' : '';
      renderer.setLocalPlayer(localId());
      renderer.render(s, alpha, frameEvents, frameDt);
      hud.update(s, frameEvents, keyboard.buildMenuOpen, performance.now() / 1000, localId());
      buildMenu.update(s, keyboard.buildMenuOpen && mode === 'playing', frameEvents, localId());
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

  function summary(s: SimState): RunSummary {
    return {
      score: s.score,
      seconds: s.tick / TICK_RATE,
      kills: totalKills(s),
      maxCombo: s.stats.maxCombo,
      credits: s.credits,
      nestsDestroyed: s.nests.filter(n => n.state === 'destroyed').length,
      nests: s.nests.length,
      best: recordScore(s.score, s.difficulty),
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
      hud.setVisible(false);
      screens.result(won, result, again);
    }, 1800);
  }

  function enterPlay() {
    frameEvents = [];
    keyboard.releaseAll();
    screens.hide();
    hud.setVisible(true);
    mode = 'playing';
    loop.resume();
    ensureAudio().music.playTrack('battle');
  }

  function newSoloGame() {
    leaveLan(false);
    role = 'solo';
    const fixed = Number(params.get('seed'));
    solo = createSim(floor01, fixed > 0 ? fixed : randomSeed(), { difficulty: settings.difficulty, names: [playerName()] });
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
      host = new HostSession(transport, { name: playerName() });
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
      client = new ClientSession(transport, { name: playerName() });
      mode = 'lobby';
      lastLobby = '';
    } catch {
      screens.notice(t('net.failed'));
    }
  }

  function showLobby() {
    mode = 'lobby';
    lastLobby = '';
    hud.setVisible(false);
    if (role === 'host') watchHostLobby();
  }

  function watchHostLobby() {
    if (!host) return;
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
      hud.setVisible(false);
      mode = 'title';
      screens.notice(t('net.hostLeft'));
      return;
    }
    if (client.status === 'playing' && mode === 'lobby') {
      enterPlay();
      return;
    }
    if (mode === 'lobby' && client.status === 'lobby') {
      const key = JSON.stringify([client.lobby, client.difficulty]);
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
    // a LAN game keeps running for everyone else
    if (role === 'solo') loop.pause();
    screens.pause();
  }

  function toTitle() {
    if (role !== 'solo') leaveLan(false);
    mode = 'title';
    solo = createSim(floor01, 1);
    hud.setVisible(false);
    screens.title();
    if (audio) audio.music.playTrack('menu');
  }

  addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing') keyboard.keyDown(e.code, performance.now());
  });
  addEventListener('keyup', e => keyboard.keyUp(e.code, performance.now()));
  addEventListener('mousemove', e => {
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

  hud.setVisible(false);
  screens.title();
  if (params.has('demo')) newSoloGame();
  if (import.meta.env.DEV && params.has('capture')) {
    // dev only (?capture=1): time only moves when the recorder asks, so recordings are smooth
    let clock = 0;
    (window as unknown as { __advance: (ms: number) => void }).__advance = ms => loop.frame((clock += ms));
  } else {
    requestAnimationFrame(function frame(now) {
      loop.frame(now);
      requestAnimationFrame(frame);
    });
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
