import type { VersusOption } from './net/protocol';
import { MAX_PLAYERS } from './sim/config/balance';
import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, type MusicPlayer } from './audio/music';
import { soundsForEvent } from './audio/sfx';
import { setKeyBindings, t } from './i18n';
import { lookOf, yawOf } from './input/first-person';
import { Keyboard } from './input/keyboard';
import { createVersusBot } from './bots/versus';
import { balanceTeams, discovery, DISCOVERY_MAPS } from './sim/systems/versus';
import { normalizePad, PadControls, PadMenu, padFamily, type PadSnapshot } from './input/gamepad';
import { createLoop } from './loop';
import { createLan, type Lan } from './net/lan';
import { PROTOCOL_VERSION, type LobbyPlayer } from './net/protocol';
import { createServerBrowser } from './net/server-list';
import { ClientSession, HostSession } from './net/session';
import { createRenderer } from './render/renderer';
import { buildRunLog, saveRunLog } from './runlog';
import { floor01 } from './sim/config/floor01';
import { FLOORS } from './sim/config/floors';
import { createSim, stepSim } from './sim/sim';
import { totalKills } from './sim/systems/stats';
import { loadProfile, rewardForRun, saveProfile, ticketsForRun } from './profile';
import { bestWeapon } from './sim/systems/stats';
import { TICK_RATE, type RunMode, type Command, type RareKind, type SimEvent, type SimState, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
import { createEmotes } from './ui/emotes';
import { KillCamRecorder, type KillCamPlayback } from './killcam';
import { DAILY_DIFFICULTY, dailyDate, dailySeed, recordDaily } from './daily';
import { createMarkers } from './ui/markers';
import { createUpdateBanner } from './ui/update-banner';
import { createScreens, loadSettings, recordScore, saveSettings, withDefaults, type JoinEntry, type RunSummary } from './ui/screens';

document.title = t('title');
const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
const randomSeed = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

if (params.has('sound')) {
  void import('./audio/soundboard').then(m => m.showSoundboard(app));
} else {
  startGame();
}

function startGame() {
  app.innerHTML = '<canvas id="game"></canvas>';
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const renderer = createRenderer(canvas, floor01);
  const keyboard = new Keyboard();
  // Xbox-style controllers: one drives the player (it takes over as soon as it is touched), any navigates menus
  const padCtl = new PadControls();
  const padMenus = [new PadMenu(), new PadMenu()];
  let padActive = false;
  const rawPads = (): Gamepad[] => (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected);
  const readPads = (): PadSnapshot[] => rawPads().map(normalizePad);
  /** the button symbol for "E" in hints: X on Xbox pads, □ on PlayStation pads */
  const useLabel = (i: number) => (padFamily(rawPads()[i]?.id ?? '') === 'playstation' ? '\u25A1' : 'X');
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
    keyboard.setBindings(settings.bindings);
    setKeyBindings(settings.bindings);
    renderer.setQuality(settings.graphics);
    renderer.setDamageNumbers(settings.damageNumbers);
  }
  applySettings();

  const playerName = () => settings.name || 'Player';

  const lanActions = {
    start: () => {
      if (!host) return;
      lanBots = [];
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
    startVote: (option?: VersusOption) => {
      if (!host) return;
      const [a, b] = voteOptions();
      host.startVote(option ? [option, b.map === option.map && b.rule === option.rule ? a : b] : [a, b]);
      lastLobby = '';
    },
    startDiscovery: () => {
      if (!host) return;
      lanDiscovery = true;
      lanBots = [];
      host.startVersus(discovery(discoveryStep++), Number(params.get('seed')) || randomSeed());
      enterPlay();
    },
    startVersus: (option: VersusOption) => {
      if (!host) return;
      lanDiscovery = false;
      lanBots = [];
      host.startVersus(option, Number(params.get('seed')) || randomSeed());
      enterPlay();
    },
    setReady: (ready: boolean) => {
      client?.setReady(ready);
      lastLobby = '';
    },
    chooseTeam: (team: 0 | 1 | null) => {
      if (host) host.setTeamWish(0, team);
      else client?.chooseTeam(team);
      lastLobby = '';
    },
    backToLobby: () => {
      lastLobby = '';
      mode = 'lobby';
    },
    vote: (choice: 0 | 1) => (host ? host.castVote(choice) : client?.castVote(choice)),
    setAutoFill: (n: number) => {
      autoFill = n;
      host?.setAutoFill(n);
      lastLobby = '';
    },
    autoFill: () => autoFill,
    setViewMode: (v: 'both' | 'fp' | 'top') => {
      lanView = v;
      if (host) host.viewMode = v;
      lastLobby = '';
    },
    viewMode: () => lanView,
  };

  /** two different versus cards for a vote: mode, rule and map at random */
  function voteOptions(): [VersusOption, VersusOption] {
    const maps = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop'];
    const pick = (): VersusOption => ({
      mode: Math.random() < 0.5 ? 'ffa' : 'team',
      rule: (['score', 'score', 'rounds', 'king', 'capture', 'gungame', 'coinop'] as const)[Math.floor(Math.random() * 7)],
      map: maps[Math.floor(Math.random() * maps.length)],
    });
    const fix = (o: VersusOption): VersusOption => (o.rule === 'capture' ? { ...o, mode: 'team' } : o.rule === 'gungame' ? { ...o, mode: 'ffa' } : o);
    const a = fix(pick());
    let b = fix(pick());
    while (b.map === a.map && b.mode === a.mode && b.rule === a.rule) b = fix(pick());
    return [a, b];
  }

  createUpdateBanner(app, window.cubeCrashers?.updates, () => ensureAudio().mixer.play('uiClick'));
  // HUD layers: the left one fills the window, in split screen each player gets a half
  const hudRoots = (['left', 'right'] as const).map(side => {
    const d = document.createElement('div');
    d.className = `hud-root ${side}`;
    app.append(d);
    return d;
  });
  // first person: a crosshair in the middle of each view
  const fpCross = hudRoots.map(root => {
    const c = document.createElement('div');
    c.className = 'fp-cross';
    c.style.display = 'none';
    root.append(c);
    return c;
  });
  // the browser refuses to capture the mouse while it is outside the window: say how to get it back
  const fpClick = document.createElement('div');
  fpClick.className = 'fp-click';
  fpClick.textContent = t('hud.clickToAim');
  fpClick.style.display = 'none';
  hudRoots[0].append(fpClick);
  // first person in a vehicle: a cockpit frame (kart, roller) or the nose of the board along the bottom
  const KART_FRAME = `<svg viewBox="0 0 400 100" preserveAspectRatio="none" class="frame"><path d="M0 100 L0 0 L22 0 L60 70 Q200 52 340 70 L378 0 L400 0 L400 100 Z" fill="#1d1a33"/><path d="M60 70 Q200 52 340 70" stroke="#ff2bd6" stroke-width="2.5" fill="none"/><path d="M22 0 L60 70 M378 0 L340 70" stroke="#3a3560" stroke-width="5"/></svg><svg viewBox="0 0 200 120" class="wheel"><circle cx="100" cy="100" r="80" fill="none" stroke="#2a2550" stroke-width="18"/><circle cx="100" cy="100" r="80" fill="none" stroke="#4a4580" stroke-width="4"/><path d="M28 104 L172 104 M100 104 L100 160" stroke="#2a2550" stroke-width="16"/><circle cx="100" cy="104" r="16" fill="#ff2bd6"/></svg>`;
  const BOARD_FRAME = `<svg viewBox="0 0 400 100" preserveAspectRatio="none" class="frame"><path d="M120 100 Q130 40 200 28 Q270 40 280 100 Z" fill="#2bf0ff" opacity="0.9"/><path d="M140 100 Q150 52 200 42 Q250 52 260 100" fill="none" stroke="#1d1a33" stroke-width="5"/></svg>`;
  const cockpits = hudRoots.map(root => {
    const c = document.createElement('div');
    c.className = 'fp-cockpit';
    c.style.display = 'none';
    // under the HUD
    root.prepend(c);
    return { el: c, kind: '' };
  });
  const showCockpit = (i: number, on: boolean, playerId: number) => {
    const s = view();
    const p = s.players.find(x => x.id === playerId);
    const kind = on && p?.vehicleId != null ? (s.vehicles.find(v => v.id === p.vehicleId)?.kind ?? '') : '';
    const c = cockpits[i];
    c.el.style.display = kind ? '' : 'none';
    if (kind && kind !== c.kind) c.el.innerHTML = kind === 'hoverboard' ? BOARD_FRAME : KART_FRAME;
    c.kind = kind;
  };
  /** the mouse is captured in first person so it can turn the view */
  let releasing = false;
  const lockPointer = (on: boolean) => {
    if (on && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
    if (!on && document.pointerLockElement === canvas) {
      // we let go ourselves (V, a menu): not a pause
      releasing = true;
      document.exitPointerLock();
    }
  };
  const markers = createMarkers(hudRoots[0]);
  const hud = createHud(hudRoots[0], { buy: i => keyboard.buy(i), ready: () => keyboard.ready() });
  const buildMenu = createBuildMenu(hudRoots[0], kind => keyboard.chooseTower(kind));
  const markers2 = createMarkers(hudRoots[1]);
  const emotes = createEmotes(hudRoots[0]);
  // the kill cam: a recording of the last seconds of a versus match, and the replay being shown
  const killcam = new KillCamRecorder();
  let replay: KillCamPlayback | null = null;
  const killBanner = document.createElement('div');
  killBanner.className = 'killcam';
  killBanner.innerHTML = `<b></b><span>${t('killcam.skip')}</span>`;
  killBanner.style.display = 'none';
  hudRoots[0].append(killBanner);
  const emotes2 = createEmotes(hudRoots[1]);
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
      daily: () => newSoloGame('run', true),
      quick: () => newSoloGame('quick'),
      endless: () => newSoloGame('endless'),
      versus: () => newVersusGame(),
      host: () => void hostGame(),
      join: () => void openJoinList(),
      // only the desktop app reaches servers on the internet
      online: window.cubeCrashers?.lan ? () => void openOnline() : undefined,
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
      // versus bots play on this computer like extra players
      if (mode === 'playing' && role === 'solo') for (const b of versusBots) cmds = [...cmds, ...b(s)];
      // dev (?bot=1 in versus, for recordings): player 1 is a bot too, the first-person view follows its aim
      if (import.meta.env.DEV && params.has('bot') && s.versus && mode === 'playing' && role === 'solo') {
        selfBot ??= createVersusBot(localId());
        cmds = [...cmds.filter(c => c.playerId !== localId()), ...selfBot(s)];
        const me = s.players.find(p => p.id === localId());
        if (me && keyboard.firstPerson) {
          const want = yawOf(me.aim);
          const diff = Math.atan2(Math.sin(want - keyboard.yaw), Math.cos(want - keyboard.yaw));
          keyboard.yaw += diff * 0.1;
        }
      }
      if (role === 'solo') {
        stepSim(s, cmds);
        keyboard.onEvents(s.events);
        padCtl.onEvents(s.events);
        padCtl2.onEvents(s.events);
        frameEvents.push(...s.events);
      } else if (role === 'host') {
        // the lobby's bots play on the host
        if (host!.sim?.versus && mode === 'playing') {
          if (lanBots.length === 0) lanBots = host!.lobby.filter(p => p.bot).map(p => createVersusBot(p.id));
          for (const b of lanBots) cmds = [...cmds, ...b(host!.sim)];
        }
        host!.step(cmds);
      } else {
        client!.sendInput(cmds);
      }
    },
    (alpha, frameDt) => {
      if (role === 'host' && host) {
        const evs = host.takeEvents();
        keyboard.onEvents(evs);
        padCtl.onEvents(evs);
        frameEvents.push(...evs);
        announce();
      }
      if (role === 'client' && client) {
        client.checkTimeout(performance.now());
        const evs = client.takeEvents();
        keyboard.onEvents(evs);
        padCtl.onEvents(evs);
        frameEvents.push(...evs);
        watchClient();
      }
      if (role === 'host' && mode === 'lobby') {
        host?.checkVote();
        // a vote just closed and started a match: join it
        if (host?.sim) {
          lanBots = [];
          enterPlay();
        } else watchHostLobby();
      }

      const s = view();
      // the crosshair replaces the mouse pointer while playing
      canvas.style.cursor = mode === 'playing' && view().run.stage === 'floor' ? 'none' : '';
      // knocked out in versus: the last seconds again, from the side of who did it
      if (!replay && s.versus && mode === 'playing' && settings.killCam && !split) {
        killcam.record(s, frameEvents);
        const kill = frameEvents.find(e => e.type === 'pvpKill' && e.victimId === localId() && e.killerId !== null && e.killerId !== localId());
        if (kill && kill.type === 'pvpKill') {
          replay = killcam.start(kill.killerId!);
          const who = s.players.find(p => p.id === kill.killerId);
          killBanner.querySelector('b')!.textContent = t('killcam.banner', { name: who?.name ?? '?' });
        }
      }
      const me = s.players.find(p => p.id === localId());
      if (replay && (mode !== 'playing' || !s.versus || (me && me.downUntil === null) || !replay.advance(frameDt))) replay = null;
      killBanner.style.display = replay ? '' : 'none';
      renderer.setViews(replay ? [replay.killerId] : split ? [0, 1] : [localId()]);
      renderer.setZoomedOut(0, zoomedOut !== padCtl.zoomedOut);
      if (split) renderer.setZoomedOut(1, padCtl2.zoomedOut);
      // first person (everywhere but the elevator shop): view 0 follows player 1's input, view 1 the second pad
      // a LAN host can allow only one view: it is kept on, whatever V says
      const forced = role === 'host' ? host?.viewMode : role === 'client' ? client?.viewMode : 'both';
      if (forced === 'fp' || forced === 'top') {
        const me = s.players.find(p => p.id === localId());
        for (const c of [keyboard, padCtl]) if (c.firstPerson !== (forced === 'fp')) c.setFirstPerson(forced === 'fp', me ? lookOf(me) : { x: 0, z: -1 });
      }
      const fp0 = mode === 'playing' || mode === 'paused' ? (padActive ? padCtl : keyboard) : null;
      const fp0on = !!fp0?.firstPerson && view().run.stage !== 'shop';
      // the kill cam is watched from above, following who did it
      renderer.setFirstPerson(0, fp0on && !replay ? { yaw: fp0!.yaw, pitch: fp0!.pitch } : null);
      const fp1on = split && padCtl2.firstPerson && view().run.stage !== 'shop';
      renderer.setFirstPerson(1, fp1on ? { yaw: padCtl2.yaw, pitch: padCtl2.pitch } : null);
      fpCross[0].style.display = fp0on && mode === 'playing' && !replay ? '' : 'none';
      fpCross[1].style.display = fp1on && mode === 'playing' ? '' : 'none';
      fpClick.style.display = fp0on && mode === 'playing' && !replay && !padActive && fp0 === keyboard && document.pointerLockElement !== canvas ? '' : 'none';
      showCockpit(0, fp0on && mode === 'playing' && !replay, localId());
      showCockpit(1, fp1on && mode === 'playing', 1);
      if (mode !== 'playing' || padActive || !keyboard.firstPerson) lockPointer(false);
      renderer.setLookAhead(0, padActive);
      // the mouse player's camera leans by where the pointer sits on screen (no feedback loop)
      if (!padActive && mode === 'playing' && !fp0on) {
        const r = canvas.getBoundingClientRect();
        const vw = r.width / (split ? 2 : 1);
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        renderer.setMouseLook(0, { x: clamp((mouse.x - r.left - vw / 2) / (vw / 2)), y: clamp((mouse.y - r.top - r.height / 2) / (r.height / 2)) });
      } else renderer.setMouseLook(0, null);
      if (split) renderer.setLookAhead(1, true);
      renderer.render(replay ? replay.state : s, alpha, replay ? replay.takeEvents() : frameEvents, frameDt);
      const menuOpen = padActive ? padCtl.buildMenuOpen : keyboard.buildMenuOpen;
      hud.setPadMode(padActive ? useLabel(0) : null);
      buildMenu.setPadLabels(padActive);
      hud2.setPadMode(useLabel(rawPads().length >= 2 ? 1 : 0));
      buildMenu2.setPadLabels(true);
      hud.update(s, frameEvents, menuOpen, performance.now() / 1000, localId());
      markers.setVisible(mode === 'playing' || mode === 'paused');
      if (mode === 'playing') markers.update(s, renderer.project);
      // quick messages: bubbles over heads, pings on the ground, and the bar while C is open
      const now = performance.now() / 1000;
      emotes.setBar(keyboard.emoteOpen && mode === 'playing' && !padActive);
      emotes.update(s, frameEvents, now, (x, z, y) => renderer.project(x, z, 0, y));
      if (split) emotes2.update(s, frameEvents, now, (x, z, y) => renderer.project(x, z, 1, y));
      buildMenu.update(s, menuOpen && mode === 'playing', frameEvents, localId(), padActive ? padCtl.menuPad : keyboard.menuPad, padActive ? padCtl.selected : keyboard.selected);
      if (split) {
        hud2.update(s, frameEvents, padCtl2.buildMenuOpen, performance.now() / 1000, 1);
        buildMenu2.update(s, padCtl2.buildMenuOpen && mode === 'playing', frameEvents, 1, padCtl2.menuPad, padCtl2.selected);
        // the right half starts at the middle of the window (CSS left: 50%): no layout read per marker
        const half = innerWidth / 2;
        if (mode === 'playing') markers2.update(s, (x, z) => {
          const r = renderer.project(x, z, 1);
          return { x: r.x - half, y: r.y };
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
    newUnlocks = rewardForRun(profile, { mode: s.run.mode, won: s.phase === 'won' });
    storeProfile();
    return n;
  }
  let newUnlocks: string[] = [];

  function summary(s: SimState): RunSummary {
    const vs = s.versus;
    if (vs) {
      // versus: no tickets or best list, the ranking goes by kills (or rounds)
      const points = (id: number, team?: 0 | 1) => (vs.rule === 'rounds' ? (vs.roundWins[vs.mode === 'team' ? (team ?? 0) : id] ?? 0) : (vs.scores[id] ?? 0));
      const top = Math.max(...s.players.map(p => points(p.id, p.team)));
      const winners = s.players.filter(p => points(p.id, p.team) === top);
      const label = vs.mode === 'team' ? t('versus.teamWon', { team: t(winners[0]?.team === 0 ? 'versus.red' : 'versus.blue') }) : t('versus.won', { name: winners.map(p => p.name).join(' & ') });
      return {
        score: 0,
        seconds: s.tick / TICK_RATE,
        kills: totalKills(s),
        maxCombo: s.stats.maxCombo,
        credits: 0,
        nestsDestroyed: 0,
        nests: 0,
        best: [],
        tickets: 0,
        unlocked: [],
        won: true,
        mode: 'versus',
        floors: 0,
        difficulty: s.difficulty,
        headline: label,
        ranking: [...s.players]
          .sort((a, b) => points(b.id, b.team) - points(a.id, a.team))
          .map(p => ({ name: p.name, color: p.color, score: points(p.id, p.team), kills: p.stats.kills, revives: 0, downs: p.stats.downs, bestCombo: p.stats.bestCombo, bestWeapon: bestWeapon(p.stats), coins: p.stats.coins, towers: p.stats.towersBuilt })),
      };
    }
    return {
      score: s.score,
      seconds: s.tick / TICK_RATE,
      kills: totalKills(s),
      maxCombo: s.stats.maxCombo,
      credits: s.credits,
      nestsDestroyed: s.nests.filter(n => n.state === 'destroyed').length,
      nests: s.nests.length,
      best: dailyRun ? recordDaily(localStorage, dailyRun, s.score) : recordScore(s.score, s.run.mode === 'endless' ? 'endless' : s.difficulty),
      daily: dailyRun ?? undefined,
      tickets: earnTickets(s),
      unlocked: newUnlocks,
      won: s.phase === 'won',
      mode: s.run.mode,
      floors: s.run.floor + (s.phase === 'won' ? 1 : 0),
      difficulty: s.difficulty,
      ranking: [...s.players]
        .sort((a, b) => b.stats.score - a.stats.score)
        .map(p => ({ name: p.name, color: p.color, score: p.stats.score, kills: p.stats.kills, revives: p.stats.revives, downs: p.stats.downs, bestCombo: p.stats.bestCombo, bestWeapon: bestWeapon(p.stats), coins: p.stats.coins, towers: p.stats.towersBuilt })),
    };
  }

  function finish(won: boolean) {
    mode = 'over';
    keyboard.releaseAll();
    const s = view();
    saveRunLog(buildRunLog(s));
    const result = summary(s);
    // gun game goes on to the next map once someone has made it through the ladder
    const gunNext = s.versus?.rule === 'gungame' ? { mode: 'ffa' as const, rule: 'gungame' as const, map: DISCOVERY_MAPS[(DISCOVERY_MAPS.indexOf(s.map.id) + 1) % DISCOVERY_MAPS.length] } : null;
    const again =
      dailyRun && role === 'solo'
        ? { label: t('daily.again'), action: () => newSoloGame('run', true) }
        : role === 'solo' && s.versus && gunNext && !settings.versusDiscovery
        ? { label: t('versus.next', { what: describe(gunNext) }), action: () => ((settings.versusMap = gunNext.map), newVersusGame()) }
        : role === 'solo' && s.versus
        ? { label: settings.versusDiscovery ? t('versus.next', { what: describe(discovery(discoveryStep)) }) : t('menu.playAgain'), action: () => newVersusGame() }
        : role === 'host' && s.versus && gunNext && !lanDiscovery
        ? { label: t('versus.next', { what: describe(gunNext) }), action: () => lanActions.startVersus(gunNext) }
        : role === 'host' && s.versus && lanDiscovery
        ? { label: t('versus.next', { what: describe(discovery(discoveryStep)) }), action: () => lanActions.startDiscovery() }
        : role === 'host'
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
    killcam.clear();
    replay = null;
    keyboard.releaseAll();
    screens.hide();
    setHudVisible(true);
    mode = 'playing';
    // versus is played in first person by default (V / View switches back); everything else from above
    const s = view();
    const versus = s.run.mode === 'versus';
    const aimOf = (id: number) => { const p = s.players.find(x => x.id === id); return p ? lookOf(p) : { x: 0, z: -1 }; };
    keyboard.setFirstPerson(versus, aimOf(localId()));
    padCtl.setFirstPerson(versus, aimOf(localId()));
    padCtl2.setFirstPerson(versus, aimOf(1));
    if (versus && !padActive) lockPointer(true);
    loop.resume();
    ensureAudio().music.playTrack('battle');
  }

  let lastSoloMode: RunMode = 'run';
  let versusBots: ((s: SimState) => Command[])[] = [];
  /** dev: player 1 played by a bot (?bot=1 in versus) */
  let selfBot: ((s: SimState) => Command[]) | null = null;
  /** bots of a LAN versus match (they run on the host) */
  let lanBots: ((s: SimState) => Command[])[] = [];
  /** fill LAN versus matches up with bots to this many players */
  let autoFill = 4;
  /** LAN: the view the host allows (sent with each start) */
  let lanView: 'both' | 'fp' | 'top' = 'both';

  /** where the discovery rotation is (alone and on the LAN) */
  let discoveryStep = 0;
  const describe = (o: { mode: string; rule: string; map: string }) =>
    `${t(`versus.${o.rule}` as 'versus.score')} · ${t(o.mode === 'team' ? 'versus.team' : 'versus.ffa')} · ${t(FLOORS[o.map].name as 'floor.plaza')}`;
  /** LAN: the host runs a discovery rotation */
  let lanDiscovery = false;

  /** Versus on this computer: one or two players (split screen) plus bots. */
  function newVersusGame() {
    leaveLan(false);
    role = 'solo';
    lastSoloMode = 'versus';
    setSplit(settings.localPlayers === 2);
    const humans = split ? 2 : 1;
    const bots = Math.max(0, Math.min(MAX_PLAYERS, settings.versusSize) - humans);
    const names = [playerName(), ...(split ? [t('split.player2')] : []), ...Array.from({ length: bots }, () => `Bot ${withDefaults({ name: '', color: null }).name}`)];
    const colors = settings.color !== null ? [settings.color] : undefined;
    // discovery: the next step of the rotation instead of the chosen match
    const pickd = settings.versusDiscovery ? discovery(discoveryStep++) : null;
    const vsMode = pickd?.mode ?? settings.versusMode, vsRule = pickd?.rule ?? settings.versusRule, vsChaos = pickd?.chaos ?? settings.versusChaos;
    const map = FLOORS[pickd?.map ?? settings.versusMap]?.map ?? floor01;
    const fixed = Number(params.get('seed'));
    // split screen in teams: player 1 is red, player 2 joins them or plays blue; bots even it out
    const teams = balanceTeams(names.map((_, i) => ({ id: i, bot: i >= humans, wish: i === 0 ? 0 : i === 1 ? (settings.splitTogether ? 0 : 1) : null })));
    solo = createSim(map, fixed > 0 ? fixed : randomSeed(), { mode: 'versus', players: names.length, names, colors, versus: { mode: vsMode, rule: vsRule, chaos: vsChaos, teams: humans === 2 ? teams : undefined } });
    versusBots = solo.players.slice(humans).map(p => createVersusBot(p.id));
    enterPlay();
  }
  /** the date of the Daily Run being played, or null */
  let dailyRun: string | null = null;
  function newSoloGame(mode: RunMode = lastSoloMode, daily = false) {
    if (mode === 'versus') return newVersusGame();
    dailyRun = daily ? dailyDate(new Date()) : null;
    versusBots = [];
    lastSoloMode = mode;
    leaveLan(false);
    role = 'solo';
    setSplit(settings.localPlayers === 2);
    const fixed = Number(params.get('seed'));
    const names = split ? [playerName(), t('split.player2')] : [playerName()];
    const colors = settings.color !== null ? (split ? [settings.color, (settings.color + 1) % 6] : [settings.color]) : undefined;
    // "Single floor" plays the map chosen on the title screen
    const first = mode === 'quick' && FLOORS[settings.quickMap] ? FLOORS[settings.quickMap].map : floor01;
    solo = dailyRun
      ? // the same run for everyone today: fixed seed and difficulty, every weapon
        createSim(floor01, dailySeed(dailyRun), { mode: 'run', players: names.length, difficulty: DAILY_DIFFICULTY, names, colors })
      : createSim(first, fixed > 0 ? fixed : randomSeed(), { mode, players: names.length, unlocked: profile.unlocked, difficulty: settings.difficulty, names, colors });
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
      host.setAutoFill(autoFill);
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

  /** the online server list: the shared one from GitHub plus the player's own, checked every few seconds */
  async function openOnline() {
    lan ??= await createLan();
    const online = lan?.online;
    if (!online) {
      screens.notice(t('net.noLan'));
      return;
    }
    const stop = () => browser.stop();
    const view = screens.online({
      join: address => {
        stop();
        void joinGame(address);
      },
      add: address => {
        if (!settings.servers.includes(address)) settings.servers = [address, ...settings.servers].slice(0, 50);
        saveSettings(settings);
        browser.refresh();
      },
      remove: address => {
        settings.servers = settings.servers.filter(a => a !== address);
        saveSettings(settings);
        browser.refresh();
      },
      back: () => {
        stop();
        screens.title();
      },
    });
    const browser = createServerBrowser({
      fetchList: () => online.fetchList(),
      probe: address => online.probe(address),
      own: () => settings.servers,
      protocol: PROTOCOL_VERSION,
      onUpdate: rows => view.update(rows),
    });
    browser.start();
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
    const next = { players: host.lobby.length, open: !host.sim && host.lobby.length < MAX_PLAYERS };
    const key = JSON.stringify(next);
    if (key === lastAnnounce) return;
    lastAnnounce = key;
    window.cubeCrashers.lan.setInfo(next);
  }

  function watchHostLobby() {
    if (!host) return;
    announce();
    // the host is on the versus page: keep the lobby from redrawing over it
    if (document.querySelector('.screen.setup')) return;
    const key = JSON.stringify([host.lobby, host.difficulty, host.voteInfo()]);
    if (key === lastLobby) return;
    lastLobby = key;
    screens.lobby(host.lobby, host.difficulty, true, 0, lanActions, host.voteInfo());
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
    // a dedicated server goes back to its lobby by itself after the results
    if (mode === 'over' && client.server && client.status === 'lobby') showLobby();
    if (mode === 'lobby' && !running) {
      // the countdown ticks in place; only real changes redraw the lobby
      const key = JSON.stringify([client.lobby, client.difficulty, client.status, client.vote, client.server && { ...client.server, startsIn: client.server.startsIn === null }]);
      if (client.server) screens.lobbyCountdown(client.server);
      if (key === lastLobby) return;
      lastLobby = key;
      screens.lobby(client.lobby as LobbyPlayer[], client.difficulty, false, client.playerId, lanActions, client.vote, client.server);
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
    if (keyboard.firstPerson && !padActive) lockPointer(true);
    // buttons still held from the pause menu (A on "Resume") must not jump or dash
    const pads = readPads();
    padCtl.releaseAll(split ? (pads.length >= 2 ? pads[0] : undefined) : pads[0]);
    padCtl2.releaseAll(split ? (pads.length >= 2 ? pads[1] : pads[0]) : undefined);
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

  let padScreen: Element | null = null;
  let padLockUntil = 0;
  const PAD_SCREEN_LOCK_MS = 1500;

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
    // a new screen ignores the pad for a moment: players still mashing A from the game must not hit "Play again"
    const screen = document.querySelector('.screen');
    if (screen !== padScreen) {
      padScreen = screen;
      padLockUntil = performance.now() + PAD_SCREEN_LOCK_MS;
    }
    if (performance.now() < padLockUntil) return;
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

  // ?paddebug=1 shows what the browser reports for each controller (name, mapping, sticks, buttons)
  if (params.has('paddebug')) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;background:#000c;color:#0f0;font:12px monospace;padding:8px;pointer-events:none;white-space:pre-wrap;max-width:60vw';
    document.body.append(box);
    const show = () => {
      requestAnimationFrame(show);
      box.textContent = rawPads()
        .map(g => `${g.id}\nmapping: ${g.mapping || '(none)'}\naxes: ${g.axes.map(a => a.toFixed(2)).join(' ')}\npressed: ${g.buttons.map((b, i) => (b.pressed ? i : null)).filter(x => x !== null).join(' ')}`)
        .join('\n\n') || 'no controller – press a button';
    };
    show();
  }

  addEventListener('keydown', e => {
    padActive = false;
    // Space (and the jump key) would scroll or press a focused button
    if (e.code === 'Space' || (mode === 'playing' && e.code === settings.bindings.jump)) e.preventDefault();
    // repeats of a held key are let through, so keys still held after a pause work again;
    // the keyboard only counts the first press for one-off actions
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.repeat) return;
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing' && e.code === settings.bindings.zoom && !e.repeat) zoomedOut = !zoomedOut;
    // V (or the player's view key): first person on or off; the mouse gets captured to turn the view
    // (not when the LAN host fixed the view)
    const fixedView = role === 'host' ? host?.viewMode !== 'both' : role === 'client' ? client?.viewMode !== 'both' : false;
    if (mode === 'playing' && e.code === settings.bindings.view && !e.repeat && !fixedView) lockPointer(!keyboard.firstPerson);
    // a versus vote in the lobby: 1 or 2
    if (mode === 'lobby' && (e.code === 'Digit1' || e.code === 'Digit2') && (host?.voteInfo() || client?.vote)) lanActions.vote(e.code === 'Digit1' ? 0 : 1);
    if (mode === 'playing') keyboard.keyDown(e.code, performance.now());
  });
  addEventListener('keyup', e => keyboard.keyUp(e.code, performance.now()));
  addEventListener('mousemove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) padActive = false;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (document.pointerLockElement === canvas) keyboard.look(e.movementX, e.movementY);
  });
  addEventListener('mousedown', e => {
    if (mode !== 'playing') return;
    // from above only clicks into the game count (the HUD has buttons); in first person the pointer may sit
    // anywhere when it was not captured (it was outside the window, or the capture was refused): every click
    // that is not on a button fires and captures it again
    const target = e.target instanceof Element ? e.target : null;
    const inGame = target === canvas || (keyboard.firstPerson && !target?.closest('button, a, input, select, label'));
    if (!inGame) return;
    // a click skips the kill cam
    if (replay) {
      replay = null;
      return;
    }
    if (e.button === 0) keyboard.mouseDown();
    // middle click: "over here!" at the crosshair
    if (e.button === 1) {
      e.preventDefault();
      keyboard.ping();
    }
    if (keyboard.firstPerson && !padActive) lockPointer(true);
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) keyboard.mouseUp();
  });
  addEventListener('wheel', e => {
    if (mode === 'playing') keyboard.wheel(e.deltaY);
  }, { passive: true });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // Escape in first person hands the mouse back (the browser does that itself): treat it as a pause
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (!releasing && mode === 'playing' && keyboard.firstPerson && !padActive) pause();
    releasing = false;
  });
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
  // dev: ?map=race starts a Single floor demo on that map
  if (params.get('map')) settings.quickMap = params.get('map')!;
  // dev: ?versus=team|ffa starts a versus match with bots right away
  if (params.has('versus')) {
    settings.versusMode = params.get('versus') === 'team' ? 'team' : 'ffa';
    newVersusGame();
  } else if (params.has('demo')) newSoloGame(params.get('mode') === 'run' ? 'run' : 'quick');
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
  // ?demo=win: a quick floor that is won right away (to look at the result screen)
  if (params.get('demo') === 'win') {
    for (const n of sim.nests) n.state = 'destroyed';
    sim.elevatorOpen = true;
    sim.players.forEach((p, i) => {
      p.pos = { ...sim.map.elevator };
      p.stats.kills = 120 - i * 30;
      p.stats.killsBy = i === 0 ? { candyCannon: 70, stomp: 50 } : { laserSword: 60, kart: 30 };
      p.stats.score = 9000 - i * 2500;
      p.stats.towersBuilt = 3 - i;
      p.stats.coins = 340 - i * 80;
    });
  }
  if (params.get('demo') === 'rare') {
    sim.players[0].jetFuel = 300;
    sim.players[0].rare = { kind: (params.get('kind') as RareKind) ?? 'slushMachine', until: sim.tick + 3600, cooldown: 0 };
    sim.players[0].rareSelected = true;
  }
  const floorParam = Number(params.get('floor'));
  if (floorParam > 0 && sim.run.mode === 'run') void import('./sim/systems/run').then(m => m.enterFloor(sim, Math.min(floorParam, sim.run.floors.length - 1)));
  if (params.get('demo') === 'shop' && sim.run.mode === 'run') void import('./sim/systems/shop').then(m => m.openShop(sim));
  // ?demo=zoo: one of every monster in a row in front of the player, crawling slowly (to look at them)
  if (params.get('demo') === 'zoo') {
    void import('./sim/systems/enemies').then(m => {
      const kinds = ['blob', 'hunter', 'tank', 'splitter', 'shooter', 'bomber', 'rammer', 'swarmer', 'shielder', 'healer', 'teleporter', 'croc', 'monkey', 'trex'] as const;
      const p = sim.players[0];
      p.invulnUntil = Number.MAX_SAFE_INTEGER;
      p.pos.z += 5;
      // two rows above the player, so they walk toward the camera
      kinds.forEach((k, i) => {
        const e = m.spawnEnemy(sim, k, { x: p.pos.x + ((i % 7) - 3) * 1.9, z: p.pos.z - (i >= 7 ? 5.6 : 3.2) });
        e.speed *= 0.05;
      });
    });
  }
  // ?demo=perch: standing on top of the nearest block in the arena (jetpack landing)
  if (params.get('demo') === 'perch') {
    void import('./sim/map/perch').then(m => {
      const p = sim.players[0];
      let best: { x: number; z: number } | null = null;
      for (let tz = 1; tz < sim.map.h - 1; tz++)
        for (let tx = 1; tx < sim.map.w - 1; tx++)
          if (m.perchable(sim.map, tx + 0.5, tz + 0.5) && (!best || Math.hypot(tx + 0.5 - p.pos.x, tz + 0.5 - p.pos.z) < Math.hypot(best.x - p.pos.x, best.z - p.pos.z))) best = { x: tx + 0.5, z: tz + 0.5 };
      if (!best) return;
      Object.assign(p, { pos: best, perched: true, jetpack: true, jetFuel: 300 });
    });
  }
  // ?demo=jetpack: a jetpack lying right next to the player (to look at it)
  if (params.get('demo') === 'jetpack') sim.jetpacks.push({ id: sim.nextId++, pos: { x: sim.players[0].pos.x + 2, z: sim.players[0].pos.z - 1 } });
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
