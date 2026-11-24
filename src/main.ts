import type { GameInfo, VersusOption } from './net/protocol';
import { allBosses } from './sim/util';
import { EARNED_CHARACTERS, FREE_CHARACTERS } from './characters';
import { JUMP_TICKS, MAX_PLAYERS } from './sim/config/balance';
import { ALL_WEAPONS, DISCO } from './sim/config/weapons';
import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, DISCO_FADE_S, DISCO_TAIL_S, discoHeard, trackToPlay, type MusicPlayer, type TrackId } from './audio/music';
import { soundsForEvent, swordClashes } from './audio/sfx';
import { createHumVoices, SwordHum, type HumVoices } from './audio/sword-hum';
import { BossSteps, createEngineVoices, MegaHum, VehicleSound, type EngineVoices } from './audio/vehicle-sound';
import { noiseBuffer } from './audio/synth';
import { mazeAmbience, rotorDuck, rotorLoudness } from './audio/ambience';
import { setColorBlindWords, setKeyBindings, t } from './i18n';
import { setColorBlind } from './render/palette';
import { createRaceView, lookOf, yawOf } from './input/first-person';
import { Keyboard } from './input/keyboard';
import { loadKeyboardLayout } from './input/bindings';
import { createVersusBot } from './bots/versus';
import { locked } from './sim/systems/missile';
import { balanceTeams, conquestHold, discovery, DISCOVERY_MAPS, side as versusSide } from './sim/systems/versus';
import { normalizePad, padBoard, PadControls, PadMenu, padFamily, type PadSnapshot } from './input/gamepad';
import { nextInDirection } from './input/pad-nav';
import { uiZoom } from './ui/scale';
import { createLoop } from './loop';
import { createProbedLoop } from './dev/perf-probe';
import { createLan, type Lan } from './net/lan';
import { PROTOCOL_VERSION, type LobbyPlayer } from './net/protocol';
import { createServerBrowser } from './net/server-list';
import type { Transport } from './net/transport';
import { webOnline } from './net/web-online';
import { ClientSession, HostSession } from './net/session';
import { createRenderer } from './render/renderer';
import { buildRunLog, createFrameCounter, saveRunLog, type RunLog } from './runlog';
import { floor01 } from './sim/config/floor01';
import { BOSS_RUSH, FLOORS, RUN_FLOORS } from './sim/config/floors';
import { createSim, stepSim } from './sim/sim';
import { floorsCleared } from './sim/systems/run';
import { totalKills } from './sim/systems/stats';
import { browserStore, loadProfile, ownedCharacter, recordBossBeaten, rewardForRun, saveProfile, ticketsForRun } from './profile';
import { bestWeapon } from './sim/systems/stats';
import { TICK_RATE, type RunMode, type Command, type KeepWeapons, type RareKind, type SimEvent, type SimState, type VehicleKind, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
import { createEmotes } from './ui/emotes';
import { KillCamRecorder, type KillCamPlayback } from './killcam';
import { DAILY_DIFFICULTY, dailyDate, dailySeed, recordDaily } from './daily';
import { createMarkers } from './ui/markers';
import { createUpdateBanner } from './ui/update-banner';
import { createGraphicsTest, type GraphicsTest } from './graphics-test';
import { createSmoother } from './render/smooth';
import { createScoreboard } from './ui/scoreboard';
import { createScreens, loadSettings, recordScore, saveSettings, withDefaults, type JoinEntry, type RunSummary } from './ui/screens';
import { MAP_ROTATION, brawlMapFor, rushMapsFor, versusMapFor } from './maps';

document.title = t('title');
const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
/** dev: puts the camera on a circle round a figure (set once the renderer exists) */
/** dev (&ride=…): switches every view on this computer to first person */
let lookOut: (() => void) | null = null;
let showroom: ((at: { x: number; z: number; height: number; radius: number; angle?: number; look?: number }) => void) | null = null;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
// the interface grows with big screens (see ui/scale.ts)
const applyUiZoom = () => document.documentElement.style.setProperty('--ui-zoom', String(uiZoom(innerWidth, innerHeight)));
applyUiZoom();
addEventListener('resize', applyUiZoom);
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
  showroom = at => renderer.setShowroom(at);
  const smooth = createSmoother();
  const raceView = createRaceView();
  // (the Town is played in first person too: one walks its streets)
  const townView = createRaceView();
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
  const store = browserStore();
  const profile = loadProfile(store);
  const storeProfile = () => saveProfile(store, profile);
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
  let audio: { ctx: AudioContext; mixer: Mixer; music: MusicPlayer; hum: HumVoices; engines: EngineVoices } | null = null;
  /** the Laser Swords of the players on this screen, from frame to frame (see sword-hum.ts) */
  const swordHum = new SwordHum();
  /** the engines and hooves of the vehicles heard on this screen (see vehicle-sound.ts) */
  const vehicleSound = new VehicleSound();
  /** the feet of the big bosses (see vehicle-sound.ts) */
  const bossSteps = new BossSteps();
  /** the Mega Block's hum while it moves (see vehicle-sound.ts) */
  const megaHum = new MegaHum();

  // dev only (?bot=1): the test bot plays, e.g. to record gameplay
  let bot: ((s: SimState) => Command[]) | null = null;
  if (import.meta.env.DEV && params.has('bot')) void import('../tests/sim/bot').then(m => (bot = m.createBot()));

  const view = (): SimState => (role === 'host' ? host?.sim : role === 'client' ? client?.view : null) ?? solo;
  const localId = () => (role === 'client' ? (client?.playerId ?? 0) : 0);

  // no sound or music from a window nobody sees (minimised, another tab, hidden)
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    audio.mixer.setMuted(document.hidden);
    if (document.hidden) void audio.ctx.suspend();
    else void audio.ctx.resume();
  });
  /** the track the game asks for (the menu, the battle, the boss, or nothing); a Disco Ball in the air plays over it */
  let baseTrack: TrackId | null = null;
  /** until when a Disco Ball's track plays (seconds on the page's clock) */
  let discoUntil = 0;
  /** in the Glitch Maze the ghosts' siren is the music */
  let mazeQuiet = false;
  /** plays what should play now; a track that is already right goes on */
  function syncMusic() {
    if (!audio) return;
    const id = mazeQuiet ? null : trackToPlay(baseTrack, discoUntil, performance.now() / 1000);
    audio.music.playTrack(id, id === 'disco' ? DISCO_FADE_S : undefined);
  }
  /** the game's own choice of track (`keepDisco`: a ball that is in the air right now plays on over it) */
  function playBase(id: TrackId | null, keepDisco = false) {
    baseTrack = id;
    if (!keepDisco) discoUntil = 0;
    syncMusic();
  }
  function ensureAudio() {
    if (!audio) {
      const ctx = new AudioContext();
      const mixer = createMixer(ctx);
      audio = { ctx, mixer, music: createMusic(ctx, mixer.musicBus), hum: createHumVoices(ctx, mixer.loopBus), engines: createEngineVoices(ctx, mixer.loopBus, noiseBuffer(ctx)) };
      applySettings();
    }
    // silent while the window is minimised or hidden (see the visibilitychange listener)
    if (!document.hidden) void audio.ctx.resume();
    return audio;
  }

  // the frames a second, counted over half a second at a time: for the counter in the corner
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fps';
  document.body.append(fpsEl);
  let fpsFrames = 0, fpsSince = performance.now();
  /** on a LAN host's lobby after a versus match, the next one starts by itself after this long */
  const NEXT_MATCH_SECONDS = 10;
  /** king of the cube: your side's points last frame (-1: not in such a match), for the tick on every new one */
  let kingSeen = -1;
  /** the graphics test while it runs (see graphics-test.ts), its notice on screen, and who waits for it */
  let gfxTest: GraphicsTest | null = null;
  let gfxDone: (() => void) | null = null;
  const gfxNote = document.createElement('div');
  gfxNote.className = 'gfx-note';
  gfxNote.style.display = 'none';
  document.body.append(gfxNote);
  let gfxNoteUntil = 0;
  function startGraphicsTest(done?: () => void) {
    if (gfxTest) return;
    gfxTest = createGraphicsTest(performance.now());
    gfxDone = done ?? null;
    gfxNote.style.display = '';
  }
  /** the bosses in the fight right now: their track plays while there is one */
  let bossesUp = 0;
  /** a run's log, with how smoothly it ran */
  const frameCounter = createFrameCounter();
  const logRun = (s: SimState, note?: RunLog['note'], fallen?: string) => saveRunLog({ ...buildRunLog(s, note, fallen), frames: frameCounter.stats() });
  function countFrame() {
    const now = performance.now();
    frameCounter.frame(now, mode === 'playing');
    fpsFrames++;
    if (now - fpsSince >= 500) {
      fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} FPS`;
      fpsFrames = 0;
      fpsSince = now;
    }
    fpsEl.style.display = settings.showFps && !gfxTest ? '' : 'none';
    if (!gfxTest) {
      if (gfxNoteUntil && now > gfxNoteUntil) {
        gfxNote.style.display = 'none';
        gfxNoteUntil = 0;
      }
      return;
    }
    gfxTest.frame(now);
    renderer.setQuality(gfxTest.quality);
    gfxNote.textContent = `${t('gfx.testing')} ${t('gfx.trying', { quality: t(`graphics.${gfxTest.quality}`) })}`;
    const result = gfxTest.result;
    if (!result) return;
    // done: the setting is kept, and said for a moment (the measured rate is with the picture drawn twice)
    gfxTest = null;
    settings.graphics = result.quality;
    settings.graphicsTested = true;
    saveSettings(settings);
    applySettings();
    gfxNote.textContent = t('gfx.done', { quality: t(`graphics.${result.quality}`), fps: Math.round(result.fps * 2) });
    gfxNoteUntil = now + 4000;
    gfxDone?.();
    gfxDone = null;
  }

  function applySettings() {
    audio?.mixer.setMusicVolume(settings.music);
    audio?.mixer.setSfxVolume(settings.sfx);
    keyboard.steerWithMouse = settings.steerWithMouse;
    keyboard.mouseSensitivity = settings.mouseSensitivity;
    keyboard.setBindings(settings.bindings);
    setKeyBindings(settings.bindings);
    // takes effect right away, also in a paused match: the renderers read the palette every frame
    setColorBlind(settings.colorBlind);
    setColorBlindWords(settings.colorBlind);
    document.body.classList.toggle('color-blind', settings.colorBlind);
    // (dev: &gfx=low|medium|high|ultra looks at the game in that quality, without changing the settings)
    const gfx = params.get('gfx');
    renderer.setQuality(import.meta.env.DEV && (gfx === 'low' || gfx === 'medium' || gfx === 'high' || gfx === 'ultra') ? gfx : settings.graphics);
    renderer.setDamageNumbers(settings.damageNumbers);
  }
  applySettings();
  // the keys as this keyboard has them (a German one says Y where the bindings mean "KeyZ"), once the browser tells
  void loadKeyboardLayout().then(known => known && setKeyBindings(settings.bindings));
  // the first start on a machine: the graphics test picks the setting once, by itself, on the title screen
  if (!settings.graphicsTested && [...params.keys()].length === 0) setTimeout(() => mode === 'title' && startGraphicsTest(), 2500);

  const playerName = () => settings.name || 'Player';

  const lanActions = {
    start: () => {
      if (!host) return;
      lanBots = [];
      host.start(Number(params.get('seed')) || randomSeed(), host.difficulty);
      enterPlay();
    },
    // Leave in a lobby goes back to where the lobby was entered from; Back in the list of LAN games to the LAN menu
    leave: () => {
      if (host || client) return leaveToOrigin();
      leaveLan(false);
      screens.lanMenu();
    },
    setDifficulty: (d: SimState['difficulty']) => {
      host?.setDifficulty(d);
      settings.difficulty = d;
      saveSettings(settings);
    },
    connect: (target: string) => void joinGame(target),
    startVote: (option?: VersusOption) => {
      if (!host) return;
      const [a, b] = voteOptions();
      host.keepWeapons = settings.versusKeep;
      host.startVote(option ? [option, b.map === option.map && b.rule === option.rule ? a : b] : [a, b]);
      // back to the lobby, where the vote is shown (the versus page would hide it)
      drawHostLobby();
    },
    startDiscovery: () => {
      if (!host) return;
      lanDiscovery = true;
      lanBots = [];
      host.keepWeapons = settings.versusKeep;
      host.startVersus(discovery(discoveryStep++), Number(params.get('seed')) || randomSeed());
      enterPlay();
    },
    startVersus: (option: VersusOption) => {
      if (!host) return;
      lanDiscovery = false;
      lanBots = [];
      host.keepWeapons = settings.versusKeep;
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
      mode = 'lobby';
      drawHostLobby();
    },
    startMode: (coop: 'quick' | 'brawl' | 'bossrush' | 'endless') => {
      if (!host) return;
      lanBots = [];
      host.start(Number(params.get('seed')) || randomSeed(), host.difficulty, coop, coop === 'brawl' ? brawlMapFor(settings.brawlMap, Math.random, lanView === 'top') : coop === 'quick' ? settings.quickMap : undefined, coop === 'bossrush' ? rushMapsFor(settings.rushMap, BOSS_RUSH.length, Math.random, lanView === 'top') : undefined);
      enterPlay();
    },
    vote: (choice: 0 | 1) => (host ? host.castVote(choice) : client?.castVote(choice)),
    setAutoFill: (n: number) => {
      autoFill = n;
      host?.setAutoFill(n);
      lastLobby = '';
    },
    autoFill: () => autoFill,
    setKeepWeapons: (k: KeepWeapons) => {
      settings.versusKeep = k;
      saveSettings(settings);
      if (host) host.keepWeapons = k;
      lastLobby = '';
    },
    setViewMode: (v: 'both' | 'fp' | 'top') => {
      lanView = v;
      // (the Town is first person only: a Single floor there goes back to the first floor, a Brawl, a Boss Rush or a
      // versus match there to the arena)
      if (v === 'top' && settings.quickMap === 'waldsee') settings.quickMap = RUN_FLOORS[0];
      if (v === 'top' && settings.brawlMap === 'waldsee') settings.brawlMap = 'arena';
      if (v === 'top' && settings.rushMap === 'waldsee') settings.rushMap = 'own';
      if (v === 'top' && settings.versusMap === 'waldsee') settings.versusMap = 'arena';
      if (host) host.viewMode = v;
      lastLobby = '';
    },
    viewMode: () => lanView,
    setGame: (game: GameInfo) => host?.setGame(game),
  };

  /** two different versus cards for a vote: mode, rule and map at random */
  function voteOptions(): [VersusOption, VersusOption] {
    const maps = ['neon', 'highway', 'floor01', 'candy', 'arena', 'rooftop'];
    const pick = (): VersusOption => ({
      mode: Math.random() < 0.5 ? 'ffa' : 'team',
      rule: (['score', 'score', 'rounds', 'king', 'conquest', 'capture', 'gungame', 'coinop'] as const)[Math.floor(Math.random() * 8)],
      map: maps[Math.floor(Math.random() * maps.length)],
    });
    const fix = (o: VersusOption): VersusOption => (o.rule === 'capture' ? { ...o, mode: 'team' } : o.rule === 'gungame' ? { ...o, mode: 'ffa' } : o);
    const a = fix(pick());
    let b = fix(pick());
    while (b.map === a.map && b.mode === a.mode && b.rule === a.rule) b = fix(pick());
    return [a, b];
  }

  createUpdateBanner(app, window.cubeCrashers?.updates, () => ensureAudio().mixer.play('uiClick'));
  // the loading screen while a floor is built: a cube that turns (on the graphics card: it keeps turning while the
  // page is busy building) and the floor's name. It fades in only after a moment, so a quick build shows nothing
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = '<div class="loading-cube"><i></i><i></i><i></i><i></i><i></i><i></i></div><p class="txt"></p>';
  loading.style.display = 'none';
  app.append(loading);
  /** a floor is being built behind the loading screen: nothing is drawn, and a game on this computer waits */
  let preparing = false;
  function prepareFloor(s: SimState) {
    preparing = true;
    const name = FLOORS[s.map.id]?.name;
    loading.querySelector('p')!.textContent = t('loading.floor', { name: name ? t(name as 'floor.plaza') : '' });
    loading.style.display = '';
    // (two frames: the loading screen is on screen before building the floor holds up the page)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        void renderer
          .prepare(view())
          .catch(e => console.error('building the floor failed', e))
          .finally(() => {
            preparing = false;
            loading.style.display = 'none';
          }),
      ),
    );
  }
  // HUD layers: the left one fills the window, in split screen each player gets a half
  const hudRoots = (['left', 'right'] as const).map(side => {
    const d = document.createElement('div');
    d.className = `hud-root ${side}`;
    app.append(d);
    return d;
  });
  // first person: a crosshair in the middle of each view, with the marks that flash on it when a shot lands
  const fpCross = hudRoots.map(root => {
    const c = document.createElement('div');
    c.className = 'fp-cross';
    c.style.display = 'none';
    c.innerHTML = '<svg class="fp-hit" viewBox="0 0 40 40"><path d="M5 5 L14 14 M35 5 L26 14 M5 35 L14 26 M35 35 L26 26"/></svg>';
    root.append(c);
    return c;
  });
  // a red glow round the edge of a view whose player was just hit
  const hurtGlow = hudRoots.map(root => {
    const d = document.createElement('div');
    d.className = 'hurt-glow';
    root.append(d);
    return d;
  });
  /** plays a one-off CSS animation (again, if it still runs) */
  const flash = (el: HTMLElement, cls: string, others: string[] = []) => {
    el.classList.remove(cls, ...others);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  /**
   * What the player of view `view` (player `id`) did and took this frame: a shot of theirs that landed on a rival
   * or the vehicle one sits in marks the crosshair and ticks (a kill louder), a hit they took glows red round
   * the edge. A hit on a monster or a boss marks the crosshair too (red when it fell to it), without the tick:
   * a horde is hit far too often for that.
   */
  function hitFeedback(view: number, id: number, events: SimEvent[], s: SimState) {
    const kill = events.some(e => e.type === 'pvpKill' && e.killerId === id && e.victimId !== id);
    const hit = kill || events.some(e => (e.type === 'playerHit' || e.type === 'vehicleHit') && e.by === id && !(e.type === 'playerHit' && e.playerId === id));
    const mobHits = events.filter(e => e.type === 'enemyHit' && e.by === id) as Extract<SimEvent, { type: 'enemyHit' }>[];
    const living = mobHits.length > 0 ? new Set(s.enemies.filter(m => m.hp > 0).map(m => m.id)) : null;
    const mobKill = mobHits.some(e => !living!.has(e.id));
    if (hit) {
      flash(fpCross[view], kill ? 'kill' : 'hit', ['hit', 'kill']);
      audio?.mixer.play(kill ? 'killConfirm' : 'hitConfirm');
    } else if (mobHits.length > 0) flash(fpCross[view], mobKill ? 'kill' : 'hit', ['hit', 'kill']);
    if (events.some(e => e.type === 'playerHit' && e.playerId === id && e.amount >= 5)) flash(hurtGlow[view], 'on');
  }
  // the browser refuses to capture the mouse while it is outside the window: say how to get it back
  const fpClick = document.createElement('div');
  fpClick.className = 'fp-click';
  fpClick.textContent = t('hud.clickToAim');
  fpClick.style.display = 'none';
  hudRoots[0].append(fpClick);
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
  // the board of who stands where, while Tab is held
  const scoreboard = createScoreboard(app);
  let boardHeld = false;
  /** the Lock-On Launcher on this screen: whether its lock was there last frame, and how many missiles were after this player */
  /** the Lock-On Launcher, per view: whether its player had a lock, and how many missiles were after them */
  const hadLock = [false, false], wasChased = [0, 0];
  /** the same from a controller: its left trigger is held */
  let padBoardHeld = false;
  // the kill cam: a recording of the last seconds of a versus match, and the replay being shown
  const killcam = new KillCamRecorder();
  let replay: KillCamPlayback | null = null;
  /** where the kill cam looks, and for which replay (a new one starts at the killer's aim) */
  let killYaw = 0;
  let killYawFor: KillCamPlayback | null = null;
  const killBanner = document.createElement('div');
  killBanner.className = 'killcam';
  killBanner.innerHTML = `<b></b><span>${t('killcam.skip')}</span>`;
  killBanner.style.display = 'none';
  hudRoots[0].append(killBanner);
  const emotes2 = createEmotes(hudRoots[1]);
  const hud2 = createHud(hudRoots[1], { buy: () => {}, ready: () => {} });
  const buildMenu2 = createBuildMenu(hudRoots[1], () => {});
  const padCtl2 = new PadControls();
  lookOut = () =>
    [keyboard, padCtl, padCtl2].forEach(c => {
      c.setFirstPerson(true, { x: 0, z: -1 });
      // (&tilt=-0.5: looking that far down, or up)
      if (params.has('tilt')) c.pitch = Number(params.get('tilt')) || 0;
    });
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
      bossRush: () => newSoloGame('bossrush'),
      bossBrawl: () => newSoloGame('brawl'),
      quick: () => newSoloGame('quick'),
      endless: () => newSoloGame('endless'),
      versus: () => newVersusGame(),
      host: () => void hostGame(),
      join: () => void openJoinList(),
      online: () => void openOnline(),
      resume,
      mainMenu: toTitle,
      // a web page cannot close itself
      quit: window.cubeCrashers ? () => window.close() : undefined,
      settingsChanged: applySettings,
      testGraphics: done => startGraphicsTest(done),
      click: () => ensureAudio().mixer.play('uiClick'),
    },
    settings,
    profile,
    storeProfile,
  );

  const loop = (import.meta.env.DEV ? createProbedLoop : createLoop)(
    () => {
      if (mode !== 'playing' && !(mode === 'paused' && role !== 'solo')) return;
      // (a game on this computer waits for its floor to be built; one with others goes on, it is not ours to hold)
      if (preparing && role === 'solo') return;
      const s = view();
      if (s.phase !== 'playing') return;
      keyboard.setAim(mode === 'playing' ? renderer.groundPoint(mouse.x, mouse.y) : null);
      const now = performance.now();
      const pads = readPads();
      // split screen: with two controllers each player has one, with one controller it belongs to player 2
      const pad = split ? (pads.length >= 2 ? pads[0] : undefined) : pads[0];
      const pad2 = split ? (pads.length >= 2 ? pads[1] : pads[0]) : undefined;
      if (pad && padTouched(pad)) padActive = true;
      padBoardHeld = padBoard(pad) || padBoard(pad2);
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
          if (lanBots.length === 0) lanBots = host!.lobby.filter(p => p.bot).map(p => createVersusBot(p.id, settings.versusBots));
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
          // (with a controller its button skips it, see pollPadMenus)
          killBanner.querySelector('span')!.textContent = padActive ? t('killcam.skipPad', { key: useLabel(0) === '\u25A1' ? '\u2715' : 'A' }) : t('killcam.skip');
        }
      }
      const me = s.players.find(p => p.id === localId());
      if (replay && (mode !== 'playing' || !s.versus || (me && me.downUntil === null) || !replay.advance(frameDt))) replay = null;
      killBanner.style.display = replay ? '' : 'none';
      // out of lives in a team game: the camera follows a teammate who is still in
      const watch = (id: number) => (view().players.find(p => p.id === id)?.out ? view().players.find(p => !p.out)?.id ?? id : id);
      renderer.setViews(replay ? [replay.killerId] : split ? [watch(0), watch(1)] : [watch(localId())]);
      renderer.setZoomedOut(0, zoomedOut !== padCtl.zoomedOut);
      if (split) renderer.setZoomedOut(1, padCtl2.zoomedOut);
      // first person (everywhere but the elevator shop): view 0 follows player 1's input, view 1 the second pad
      // a LAN host can allow only one view: it is kept on, whatever V says
      const forced = role === 'host' ? host?.viewMode : role === 'client' ? client?.viewMode : 'both';
      if (forced === 'fp' || forced === 'top') {
        const me = s.players.find(p => p.id === localId());
        for (const c of [keyboard, padCtl]) if (c.firstPerson !== (forced === 'fp')) c.setFirstPerson(forced === 'fp', me ? lookOf(me) : { x: 0, z: -1 });
      }
      // the Kart Rally starts in first person (unless the LAN host fixed the view); after it everyone has the
      // view of the floors again
      {
        const lookFor = (id: number) => { const p = s.players.find(x => x.id === id); return p ? lookOf(p) : { x: 0, z: -1 }; };
        const wasFp = keyboard.firstPerson;
        raceView.update(
          s.run.stage === 'race' && s.phase === 'playing' && forced === 'both' && (mode === 'playing' || mode === 'paused'),
          [{ control: keyboard, look: lookFor(localId()) }, { control: padCtl, look: lookFor(localId()) }, { control: padCtl2, look: lookFor(1) }],
        );
        // the Town is walked in first person, and stays so while one is there
        const inTown = s.map.id === 'waldsee' && s.run.stage === 'floor' && s.phase === 'playing' && forced === 'both' && (mode === 'playing' || mode === 'paused') && !params.has('see') && params.get('demo') !== 'witch';
        const controls = [{ control: keyboard, look: lookFor(localId()) }, { control: padCtl, look: lookFor(localId()) }, { control: padCtl2, look: lookFor(1) }];
        townView.update(inTown, controls);
        if (inTown) for (const c of controls) if (!c.control.firstPerson) c.control.setFirstPerson(true, c.look);
        // (where the view is fixed the view key does nothing: it would only make the view jump back to where one aims)
        for (const c of controls) c.control.viewLocked = inTown || ((forced === 'fp' || forced === 'top') && c.control !== padCtl2);
        if (keyboard.firstPerson && !wasFp && mode === 'playing' && !padActive) lockPointer(true);
      }
      const fp0 = mode === 'playing' || mode === 'paused' ? (padActive ? padCtl : keyboard) : null;
      const fp0on = !!fp0?.firstPerson && view().run.stage !== 'shop';
      // the kill cam is watched through the eyes of who did it: the view turns with their aim, a little smoothed
      const killer = replay?.state.players.find(p => p.id === replay!.killerId);
      if (killer) {
        const want = Math.atan2(-killer.aim.x, -killer.aim.z);
        const off = Math.atan2(Math.sin(want - killYaw), Math.cos(want - killYaw));
        killYaw = killYawFor === replay ? killYaw + off * Math.min(1, frameDt * 12) : want;
        killYawFor = replay;
      }
      renderer.setFirstPerson(0, killer ? { yaw: killYaw, pitch: -0.06 } : fp0on && !replay ? { yaw: fp0!.yaw, pitch: fp0!.pitch } : null);
      const fp1on = split && padCtl2.firstPerson && view().run.stage !== 'shop';
      renderer.setFirstPerson(1, fp1on ? { yaw: padCtl2.yaw, pitch: padCtl2.pitch } : null);
      fpCross[0].style.display = fp0on && mode === 'playing' && !replay ? '' : 'none';
      // in first person the minimap shrinks and fades so it does not get in the way; the map key hides it
      document.body.classList.toggle('fp', fp0on && !split);
      document.body.classList.toggle('no-map', !settings.showMap);
      fpCross[1].style.display = fp1on && mode === 'playing' ? '' : 'none';
      fpClick.style.display = fp0on && mode === 'playing' && !replay && !padActive && fp0 === keyboard && document.pointerLockElement !== canvas ? '' : 'none';
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
      // players and vehicles are drawn between two ticks, so a fast kart glides instead of hopping, and so is
      // where a player aims, so the figure turns and its crosshair slides as smoothly as the body runs
      const shown = replay ? replay.state : s;
      // (a LAN client's state comes in snapshots: there the smoother goes by the time between frames. So does the
      // kill cam's: its replay runs by its own clock, not by the ticks of the match that goes on behind it)
      // a new floor is built behind the loading screen first, instead of in the middle of a frame, which stood still
      if (!preparing && renderer.needsBuild(shown)) prepareFloor(shown);
      if (!preparing) {
        const restore = smooth(shown, alpha, role === 'client' || replay ? { frameDt } : undefined);
        try {
          renderer.render(shown, alpha, replay ? replay.takeEvents() : frameEvents, frameDt);
          // (the graphics test draws the picture a second time: see graphics-test.ts)
          if (gfxTest) renderer.render(shown, alpha, [], 0);
        } finally {
          restore();
        }
      }
      countFrame();
      const menuOpen = padActive ? padCtl.buildMenuOpen : keyboard.buildMenuOpen;
      hud.setPadMode(padActive ? useLabel(0) : null);
      hud.setShopFocus(padActive ? padCtl.shopFocus : null);
      buildMenu.setPadLabels(padActive);
      hud2.setPadMode(useLabel(rawPads().length >= 2 ? 1 : 0));
      hud2.setShopFocus(padCtl2.shopFocus);
      buildMenu2.setPadLabels(true);
      hud.update(s, frameEvents, menuOpen, performance.now() / 1000, localId());
      if (mode === 'playing' && !replay) {
        hitFeedback(0, localId(), frameEvents, s);
        if (split) hitFeedback(1, 1, frameEvents, s);
      }
      scoreboard.update(s, (boardHeld || padBoardHeld) && mode === 'playing' && s.run.stage === 'floor', localId(), s.versus ? t(`versus.${s.versus.rule}` as 'versus.score') : t(s.run.mode === 'brawl' ? 'brawl.title' : s.run.mode === 'bossrush' ? 'bossrush.title' : (`mode.${s.run.mode}` as 'mode.run')));
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
          return { x: r.x - half, y: r.y, behind: r.behind };
        });
      }
      markers2.setVisible(split && (mode === 'playing' || mode === 'paused'));
      if (audio) {
        // (two players on one screen in different teams: cube events sound neutral, nobody hears the other's side)
        const screenTeams = new Set((split ? [localId(), 1] : [localId()]).map(id => s.players.find(p => p.id === id)?.team));
        const myTeam = screenTeams.size === 1 ? [...screenTeams][0] : undefined;
        // king of the cube: a tick for every point your side scores in the zone, higher the closer the win;
        // zone conquest: a tick for every second your side's hold builds up, higher the closer the zone is taken
        const kv = s.versus;
        const kingMe = s.players.find(p => p.id === localId());
        const mySide = kingMe && kv ? versusSide(s, kingMe) : null;
        const cq = kv?.conquest;
        const kingHave = !kv?.king || !kingMe ? -1
          : cq ? Math.floor((cq.holds[mySide ?? -1] ?? 0) / TICK_RATE)
          : kv.mode === 'team' ? kv.teamScores[kingMe.team ?? 0] : (kv.scores[kingMe.id] ?? 0);
        const kingOf = cq ? conquestHold(s) / TICK_RATE : (kv?.limit ?? 1);
        if (kv && kingHave > kingSeen && kingSeen >= 0) audio.mixer.play('coin', 1 + Math.min(1, kingHave / kingOf) * 0.6);
        kingSeen = kingHave;
        for (const e of frameEvents) for (const snd of soundsForEvent(e, myTeam, split ? undefined : localId())) audio.mixer.play(snd.id, snd.pitch);
        for (const snd of swordClashes(frameEvents)) audio.mixer.play(snd.id, snd.pitch);
        // the Laser Sword in a hand on this screen: it lights and goes out, and hums while it is drawn; only while a
        // match is played and shown (not paused, not in a menu, not over, not in the kill cam)
        const hum = swordHum.frame(s, split ? [localId(), 1] : [localId()], mode === 'playing' && !replay && s.phase === 'playing', frameDt);
        for (const cue of hum.cues) audio.mixer.play(cue);
        audio.hum.set(hum.voices);
        // the vehicles: engines that rev with the speed, the unicorn's hooves (same rule: only while it is played and shown)
        const ride = vehicleSound.frame(s, split ? [localId(), 1] : [localId()], mode === 'playing' && !replay && s.phase === 'playing', frameDt);
        for (const cue of ride.cues) audio.mixer.play(cue.id, cue.pitch);
        audio.engines.set(ride.voices);
        // the big bosses' feet: the Rhino trotting and thundering in its charge, King Rex, the Tarantula Queen,
        // Angry Dominik; louder the closer they are
        for (const step of bossSteps.frame(s, split ? [localId(), 1] : [localId()], mode === 'playing' && !replay && s.phase === 'playing', frameDt)) audio.mixer.play(step.id, step.pitch, true, step.volume);
        // the Lock-On Launcher: a tone when the lock is there, an alarm when a missile is after a player on this screen
        for (const [view, id] of [[0, localId()], [1, 1]] as const) {
          const mine = view === 0 || split ? s.players.find(p => p.id === id) : undefined;
          const hasLock = mode === 'playing' && !!mine && locked(mine);
          if (hasLock && !hadLock[view]) audio.mixer.play('lockOn');
          hadLock[view] = hasLock;
          const chased = mode === 'playing' && mine ? s.projectiles.filter(p => p.behavior === 'missile' && p.seek?.rival && p.seek.id === id).length : 0;
          if (chased > wasChased[view]) audio.mixer.play('lockWarn');
          wasChased[view] = chased;
        }
        // (a Disco Ball near a player on this screen: its track, for as long as it hangs there)
        const ears = s.players.filter(p => p.id === localId() || (split && p.id === 1)).map(p => p.pos);
        // the life in the world: a bird's chirp, a cat, the crowd, near a player on this screen (the crowd fills the arena)
        for (const l of renderer.takeLifeSounds()) {
          const near = l.id === 'crowdCheer' || ears.some(e => Math.hypot(e.x - l.x, e.z - l.z) < (l.id === 'birdChirp' ? 16 : 12));
          if (near && mode === 'playing') audio.mixer.play(l.id, 0.92 + Math.random() * 0.16);
        }
        // the helicopter on the helipad: its rotor is heard by whoever is on the pad, louder the nearer
        // (an attack helicopter near them is the rotor to listen for: the parked one sinks under its beat)
        const gunships = allBosses(s).flatMap(b => (b.heli ? s.enemies.filter(e => e.id === b.enemyId).map(e => ({ pos: e.pos, low: e.fly === 'low' })) : []));
        audio.mixer.setAmbience('rotor', mode === 'playing' || mode === 'paused' ? rotorLoudness(s.map.id, ears) * rotorDuck(gunships, ears) : 0);
        // the Glitch Maze: the ghosts' siren while they hunt (faster as the maze empties), a wobble while they flee;
        // the music keeps out of it
        const maze = mode === 'playing' || mode === 'paused' ? mazeAmbience(s) : { siren: 0, scared: 0, speed: 0 };
        audio.mixer.setAmbience('mazeSiren', maze.siren, maze.speed);
        audio.mixer.setAmbience('mazeScared', maze.scared);
        // the Mega Block hums as it shoves itself along, louder the closer and higher the faster
        const block = megaHum.frame(s, split ? [localId(), 1] : [localId()], mode === 'playing' && !replay && s.phase === 'playing', frameDt);
        audio.mixer.setAmbience('megaHum', block.level, block.speed);
        const quiet = maze.siren > 0 || maze.scared > 0;
        if (quiet !== mazeQuiet) {
          mazeQuiet = quiet;
          syncMusic();
        }
        for (const e of frameEvents) {
          // the fast track belongs to a boss fight and to the highest alarm
          if (e.type === 'bossSpawn') bossesUp++;
          if (e.type === 'bossDead') bossesUp = Math.max(0, bossesUp - 1);
          if (e.type === 'alarmChanged' || e.type === 'bossSpawn' || e.type === 'bossDead') playBase(s.alarm.level >= 5 || bossesUp > 0 ? 'boss' : 'battle', true);
          if (e.type === 'gameWon' || e.type === 'gameLost') playBase(null);
          if (e.type === 'discoZap' && !e.pulse && discoHeard(e.pos, ears)) discoUntil = performance.now() / 1000 + DISCO.show + DISCO_TAIL_S;
        }
        syncMusic();
      }
      for (const e of frameEvents) {
        if ((e.type === 'gameWon' || e.type === 'gameLost') && (mode === 'playing' || mode === 'paused')) finish(e.type === 'gameWon');
        // a boss fell while this player was in the game (not one that broke into a versus match, and not in a
        // replay): remembered, some characters can only be bought after
        if (e.type === 'bossDead' && e.kind && !s.versus && mode === 'playing' && s.players.some(p => p.id === localId()) && recordBossBeaten(profile, e.kind)) storeProfile();
        // a boss fight is worth a log of its own, even if the run goes on or is left afterwards
        if (e.type === 'bossDead' && role !== 'client' && (mode === 'playing' || mode === 'paused')) logRun(view(), 'bossDead', e.kind);
      }
      frameEvents = [];
    },
  );

  /** tickets for this run go into the local profile (in LAN games every player earns their own) */
  function earnTickets(s: SimState): number {
    const n = ticketsForRun({ score: s.score, floors: floorsCleared(s).cleared, difficulty: s.difficulty });
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
        floorsTotal: 0,
        difficulty: s.difficulty,
        headline: label,
        me: localId(),
        // (a team match: the table lists red and blue apart, the team with more points or rounds first)
        teamScores: vs.mode === 'team' ? (vs.rule === 'rounds' ? [vs.roundWins[0] ?? 0, vs.roundWins[1] ?? 0] : [...vs.teamScores]) : undefined,
        ranking: [...s.players]
          .sort((a, b) => points(b.id, b.team) - points(a.id, a.team))
          .map(p => ({ id: p.id, name: p.name, color: p.color, team: p.team, bot: !!p.bot, score: points(p.id, p.team), kills: p.stats.kills, revives: 0, downs: p.stats.downs, bestCombo: p.stats.bestCombo, bestWeapon: bestWeapon(p.stats), coins: p.stats.coins, towers: p.stats.towersBuilt })),
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
      best: dailyRun ? recordDaily(store, dailyRun, s.score) : recordScore(s.score, s.run.mode === 'endless' ? 'endless' : s.run.mode === 'bossrush' ? 'bossrush' : s.run.mode === 'brawl' ? 'brawl' : s.difficulty),
      daily: dailyRun ?? undefined,
      tickets: earnTickets(s),
      unlocked: newUnlocks,
      won: s.phase === 'won',
      mode: s.run.mode,
      floors: floorsCleared(s).cleared,
      floorsTotal: floorsCleared(s).total,
      difficulty: s.difficulty,
      me: localId(),
      ranking: [...s.players]
        .sort((a, b) => b.stats.score - a.stats.score)
        .map(p => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, score: p.stats.score, kills: p.stats.kills, revives: p.stats.revives, downs: p.stats.downs, bestCombo: p.stats.bestCombo, bestWeapon: bestWeapon(p.stats), coins: p.stats.coins, towers: p.stats.towersBuilt })),
    };
  }

  /** the arena of the last versus match (the rotation picks another one) */
  let lastVersusMap: string | null = null;
  function finish(won: boolean) {
    mode = 'over';
    keyboard.releaseAll();
    const s = view();
    logRun(s);
    const result = summary(s);
    // gun game goes on to the next map once someone has made it through the ladder
    const gunNext = s.versus?.rule === 'gungame' ? { mode: 'ffa' as const, rule: 'gungame' as const, map: DISCOVERY_MAPS[(DISCOVERY_MAPS.indexOf(s.map.id) + 1) % DISCOVERY_MAPS.length] } : null;
    const again =
      dailyRun && role === 'solo'
        ? { label: t('daily.again'), action: () => newSoloGame('run', true) }
        : role === 'solo' && s.versus && gunNext && !settings.versusDiscovery
        ? settings.versusMap === MAP_ROTATION
          ? { label: t('versus.nextMap'), action: () => newVersusGame() }
          : { label: t('versus.next', { what: describe(gunNext) }), action: () => ((settings.versusMap = gunNext.map), newVersusGame()) }
        : role === 'solo' && s.versus
        ? { label: settings.versusDiscovery ? t('versus.next', { what: describe(discovery(discoveryStep)) }) : settings.versusMap === MAP_ROTATION ? t('versus.nextMap') : t('menu.playAgain'), action: () => newVersusGame() }
        : role === 'host' && s.versus && gunNext && !lanDiscovery
        ? { label: t('versus.next', { what: describe(gunNext) }), action: () => lanActions.startVersus(gunNext) }
        : role === 'host' && s.versus && lanDiscovery
        ? { label: t('versus.next', { what: describe(discovery(discoveryStep)) }), action: () => lanActions.startDiscovery() }
        : role === 'host'
        ? { label: t('lobby.back'), action: () => backToLobby() }
        : role === 'client'
          ? { label: t('lobby.back'), action: () => backToLobby() }
          : // the same game again: a Single floor on the same map, a Boss Rush, a Brawl… (not a new run from the first floor)
            { label: t('menu.playAgain'), action: () => newSoloGame() };
    setTimeout(() => {
      if (mode !== 'over') return;
      setHudVisible(false);
      // dev: ?versus=team&demo=win&lobby=1 shows the lobby with the last match, as online and on the LAN
      if (import.meta.env.DEV && params.has('lobby') && role === 'solo') {
        screens.setLastMatch({ won, summary: result });
        return screens.lobby(s.players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, team: p.team })), s.difficulty, false, localId(), lanActions, null, null, null);
      }
      if (role === 'solo') return screens.result(won, result, again, wayOut());
      // online and on the LAN a match ends straight in the lobby, which shows how it went; a host's versus goes on
      // to the next match by itself after a while, so nobody waits for whoever is away from the keys
      const goesOn = role === 'host' && !!s.versus && (!!gunNext || lanDiscovery);
      screens.setLastMatch({ won, summary: result, next: goesOn ? { label: again.label, action: again.action, at: Date.now() + NEXT_MATCH_SECONDS * 1000 } : undefined });
      backToLobby();
    }, 1800);
  }

  function enterPlay() {
    // (the lobby showed the last match until this one began)
    screens.setLastMatch(null);
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
    raceView.reset();
    townView.reset();
    keyboard.setFirstPerson(versus, aimOf(localId()));
    padCtl.setFirstPerson(versus, aimOf(localId()));
    padCtl2.setFirstPerson(versus, aimOf(1));
    if (versus && !padActive) lockPointer(true);
    loop.resume();
    frameCounter.reset();
    bossesUp = 0;
    ensureAudio().mixer.setPaused(false);
    playBase('battle');
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
    // (a match needs two: alone there is always at least one bot)
    const bots = Math.max(humans === 1 ? 1 : 0, Math.min(MAX_PLAYERS, settings.versusSize) - humans);
    const names = [playerName(), ...(split ? [t('split.player2')] : []), ...Array.from({ length: bots }, () => `Bot ${withDefaults({ name: '', color: null }).name}`)];
    const colors = settings.color !== null ? [settings.color] : undefined;
    // discovery: the next step of the rotation instead of the chosen match
    const pickd = settings.versusDiscovery ? discovery(discoveryStep++) : null;
    const vsMode = pickd?.mode ?? settings.versusMode, vsRule = pickd?.rule ?? settings.versusRule, vsChaos = pickd?.chaos ?? settings.versusChaos !== false, vsBoss = !pickd && settings.versusChaos === 'boss';
    // the map rotation: a random arena, another one than the last
    lastVersusMap = pickd?.map ?? versusMapFor(settings.versusMap, lastVersusMap);
    const map = FLOORS[lastVersusMap]?.map ?? floor01;
    const fixed = Number(params.get('seed'));
    // split screen in teams: player 1 is red, player 2 joins them or plays blue; bots even it out
    const teams = balanceTeams(names.map((_, i) => ({ id: i, bot: i >= humans, wish: i === 0 ? 0 : i === 1 ? (settings.splitTogether ? 0 : 1) : null })));
    solo = createSim(map, fixed > 0 ? fixed : randomSeed(), { mode: 'versus', players: names.length, names, colors, characters: [ownedCharacter(profile, settings.character)], bots: names.map((_, i) => i >= humans), versus: { mode: vsMode, rule: vsRule, chaos: vsChaos, boss: vsBoss, teams: humans === 2 ? teams : undefined, keep: settings.versusKeep }, countdown: !params.has('capture') && !(import.meta.env.DEV && params.has('nocount')) });
    versusBots = solo.players.slice(humans).map(p => createVersusBot(p.id, settings.versusBots));
    // dev: ?versus=ffa|team&demo=win (&size=10, &nocount=1) ends the match right at GO with made-up scores, to
    // look at the result screen
    if (import.meta.env.DEV && params.get('demo') === 'win' && solo.versus) {
      solo.players.forEach((p, i) => {
        solo!.versus!.scores[p.id] = Math.max(0, 9 - i * 2);
        if (p.team !== undefined) solo!.versus!.teamScores[p.team] += solo!.versus!.scores[p.id];
        p.stats.kills = 50 - i * 4;
        p.stats.downs = 3 + i;
      });
      solo.versus.endsAt = solo.tick + 1;
    }
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
    // dev: ?demo=cast lines up a full house of players to look at
    // (&crowd=1 does the same in any other demo: nine more players stand about, e.g. with &as=babyDino to see
    // what ten of one figure cost)
    const cast = import.meta.env.DEV && (params.get('demo') === 'cast' || params.has('crowd'));
    const names = cast ? Array.from({ length: MAX_PLAYERS }, (_, i) => `${params.get('cast') === 'bots' || (params.get('cast') === 'mix' && i % 2 === 1) ? 'Bot' : 'P'} ${'ABCDEFGHIJ'[i]}`) : split ? [playerName(), t('split.player2')] : [playerName()];
    const colors = cast ? undefined : settings.color !== null ? (split ? [settings.color, (settings.color + 1) % 6] : [settings.color]) : undefined;
    // the first player's own character; a second one on this computer gets what the game picks
    const characters = [ownedCharacter(profile, settings.character)];
    // "Single floor" plays the map chosen on the title screen
    // (the Boss Brawl is in the Mega Block Arena, or on the map picked for it)
    const first = mode === 'brawl' ? FLOORS[brawlMapFor(settings.brawlMap)].map : mode === 'quick' && FLOORS[settings.quickMap] ? FLOORS[settings.quickMap].map : floor01;
    solo = dailyRun
      ? // the same run for everyone today: fixed seed and difficulty, every weapon
        createSim(floor01, dailySeed(dailyRun), { mode: 'run', players: names.length, difficulty: DAILY_DIFFICULTY, names, colors, characters, countdown: true })
      : createSim(first, fixed > 0 ? fixed : randomSeed(), { mode, players: names.length, unlocked: profile.unlocked, difficulty: settings.difficulty, names, colors, characters, countdown: !params.has('capture') && !(import.meta.env.DEV && params.has('nocount')), rushMaps: mode === 'bossrush' ? rushMapsFor(settings.rushMap, BOSS_RUSH.length) : undefined });
    if (params.has('demo')) applyDemo(solo);
    enterPlay();
    if (cast && params.has('fp')) keyboard.setFirstPerson(true, { x: 0, z: -1 });
    // (dev, for screenshots: &at=x,z puts the first player there, &face=dx,dz turns their first-person view that way)
    if (import.meta.env.DEV && params.has('at')) {
      const [x, z] = params.get('at')!.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) solo.players[0].pos = { x, z };
    }
    if (import.meta.env.DEV && params.has('face')) {
      const [x, z] = params.get('face')!.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) keyboard.setFirstPerson(true, { x, z });
    }
  }

  // ---------- LAN ----------

  async function ensureLan(): Promise<Lan | null> {
    lan ??= await createLan();
    if (!lan) screens.notice(t('net.noLan'), screens.lanMenu);
    return lan;
  }

  /** where a lobby was entered from (the LAN menu, the list of LAN games, the online server list): leaving it,
   *  being turned away and losing the host all lead back there, not to the title */
  let lanOrigin: (() => void) | null = null;
  function leaveToOrigin(notice?: string) {
    const back = lanOrigin ?? (() => screens.lanMenu());
    // (the title's own tidying up: the session, the HUD, the music; then the page one came from over it)
    toTitle();
    if (notice) screens.notice(notice, back);
    else back();
  }

  /** in a game with others: the button that leaves it, back to the list it was joined from */
  const wayOut = () => (role === 'solo' ? undefined : { label: t(role === 'host' ? 'net.endGame' : client?.server ? 'net.leaveServer' : 'net.leaveGame'), action: () => leaveToOrigin() });

  async function hostGame() {
    if (!(await ensureLan())) return;
    lanOrigin = () => screens.lanMenu();
    try {
      const transport = await lan!.host(playerName());
      leaveLan(false);
      role = 'host';
      setSplit(false);
      host = new HostSession(transport, { name: playerName(), color: settings.color, character: ownedCharacter(profile, settings.character), unlocked: profile.unlocked });
      host.keepWeapons = settings.versusKeep;
      host.setAutoFill(autoFill);
      host.setDifficulty(settings.difficulty);
      showLobby();
    } catch {
      screens.notice(t('net.failed'));
    }
  }

  async function openJoinList() {
    if (!(await ensureLan())) return;
    lanOrigin = () => void openJoinList();
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
    // the desktop app connects for the game; on a web page the browser does it itself
    const online = lan?.online ?? webOnline();
    lanOrigin = () => void openOnline();
    const stop = () => browser.stop();
    const view = screens.online({
      web: online.web,
      defaultPort: online.defaultPort,
      join: address => {
        stop();
        void joinGame(address, online.join);
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
      web: online.web,
      protocol: PROTOCOL_VERSION,
      onUpdate: rows => view.update(rows),
    });
    browser.start();
  }

  /** the game joined last and how: where to come back to when the connection breaks off */
  let lastJoin: { target: string; join: (target: string) => Promise<Transport> } | null = null;
  /** counts the tries to come back: a newer one, or the player giving up, ends the older */
  let reconnects = 0;
  const RECONNECT = { tries: 14, everyMs: 2500 };
  /** who this player is to a host across connections: it keeps their seat when the line breaks */
  const rejoinKey = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

  function enterAsClient(transport: Transport) {
    leaveLan(false);
    role = 'client';
    setSplit(false);
    client = new ClientSession(transport, { name: playerName(), color: settings.color, character: ownedCharacter(profile, settings.character), unlocked: profile.unlocked, key: rejoinKey });
    mode = 'lobby';
    lastLobby = '';
  }

  async function joinGame(target: string, join: (target: string) => Promise<Transport> = t => lan!.join(t)) {
    stopDiscovery?.();
    stopDiscovery = null;
    reconnects++;
    try {
      const transport = await join(target);
      lastJoin = { target, join };
      enterAsClient(transport);
    } catch {
      screens.notice(t('net.failed'), lanOrigin ?? undefined);
    }
  }

  /**
   * The connection to the host broke off: knock again for a while. Whoever gets through comes into the lobby
   * and from there into the game that runs, like a newcomer (see HostSession.admit).
   */
  async function reconnect() {
    const to = lastJoin;
    const back = lanOrigin ?? (() => screens.lanMenu());
    // (no goodbye on the old line: the host keeps the seat for whoever comes back)
    client?.hangUp();
    toTitle();
    if (!to) return screens.notice(t('net.hostLeft'), back);
    const mine = ++reconnects;
    screens.notice(t('net.reconnecting'), () => {
      reconnects++;
      back();
    });
    for (let i = 0; i < RECONNECT.tries; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, RECONNECT.everyMs));
      if (mine !== reconnects) return;
      try {
        const transport = await to.join(to.target);
        if (mine !== reconnects) return transport.close();
        return enterAsClient(transport);
      } catch {
        // (not there yet: once more)
      }
    }
    if (mine === reconnects) screens.notice(t('net.hostLeft'), back);
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
    // (a game that runs takes newcomers too; a bot makes room for a person)
    const next = { players: host.lobby.length, open: host.lobby.filter(p => !p.bot).length < MAX_PLAYERS };
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
    drawHostLobby();
  }
  /** shows the host's lobby now, also over the versus page */
  function drawHostLobby() {
    if (!host) return;
    lastLobby = JSON.stringify([host.lobby, host.difficulty, host.voteInfo()]);
    screens.lobby(host.lobby, host.difficulty, true, 0, lanActions, host.voteInfo());
  }

  /** follows what the host does: lobby changes, the start of a run, the host leaving */
  function watchClient() {
    if (!client) return;
    if (client.status === 'rejected') {
      const reason = client.rejectReason ?? 'full';
      leaveToOrigin(t(`net.rejected.${reason}` as 'net.rejected.full'));
      return;
    }
    if (client.status === 'hostLeft') {
      // the line broke off (the host did not say goodbye): try to come back before giving up
      if (client.lost && lastJoin) void reconnect();
      else leaveToOrigin(t('net.hostLeft'));
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
      const key = JSON.stringify([client.lobby, client.difficulty, client.status, client.vote, client.game, client.server && { ...client.server, startsIn: client.server.startsIn === null }]);
      if (client.server) screens.lobbyCountdown(client.server);
      if (key === lastLobby) return;
      lastLobby = key;
      screens.lobby(client.lobby as LobbyPlayer[], client.difficulty, false, client.playerId, lanActions, client.vote, client.server, client.game);
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
    audio?.mixer.setPaused(false);
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    keyboard.releaseAll();
    padCtl.releaseAll();
    padCtl2.releaseAll();
    // a LAN game keeps running for everyone else
    if (role === 'solo') loop.pause();
    audio?.mixer.setPaused(true);
    // (the frames go on behind the menu and keep it quiet too; this only does it at once)
    audio?.hum.silence();
    audio?.engines.silence();
    screens.pause(role !== 'solo', wayOut());
  }

  function toTitle() {
    // a run that is left unfinished still leaves a log (how far it got, what hurt)
    if ((mode === 'playing' || mode === 'paused') && role !== 'client' && view().phase === 'playing' && view().tick > 5 * 60) logRun(view(), 'left');
    if (role !== 'solo') leaveLan(false);
    mode = 'title';
    setSplit(false);
    solo = createSim(floor01, 1);
    setHudVisible(false);
    screens.title();
    if (audio) {
      // nothing of the game rings on in the menu
      audio.mixer.setPaused(false);
      audio.mixer.cutEffects();
      audio.hum.silence();
      audio.engines.silence();
      mazeQuiet = false;
      playBase('menu');
    }
  }

  /** when the last game ended: A is ignored for a moment after it, so players still mashing A do not hit "Play again" */
  let playedUntil = 0;
  const PAD_AFTER_GAME_MS = 1200;
  let padFocused: HTMLElement | null = null;

  /**
   * Controller in menus: d-pad or stick moves to the button that way, A presses, B goes back, Start pauses and
   * resumes. A slider takes left and right itself (quieter, louder); a link is pressed like a button. In a game, A
   * skips the kill cam.
   */
  function pollPadMenus() {
    requestAnimationFrame(pollPadMenus);
    if (mode === 'playing') playedUntil = performance.now();
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
    if (mode === 'playing' && replay && e.a) {
      replay = null;
      return;
    }
    if (mode === 'playing' || !(e.up || e.down || e.left || e.right || e.a || e.b)) return;
    const buttons = [...document.querySelectorAll<HTMLElement>('.screen button:not(:disabled), .screen input[type=range], .screen a[href]')].filter(b => b.offsetParent !== null);
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    // a slider with the focus: left and right turn it, up and down leave it
    const slider = at >= 0 && buttons[at] instanceof HTMLInputElement ? (buttons[at] as HTMLInputElement) : null;
    if (slider && (e.left || e.right)) {
      if (e.right) slider.stepUp();
      else slider.stepDown();
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // the controller's own highlight: the browser hides its focus ring when the mouse was used last
    const focus = (b: HTMLElement) => {
      padFocused?.classList.remove('pad-focus');
      b.focus();
      b.classList.add('pad-focus');
      padFocused = b;
    };
    const dir = e.up ? 'up' : e.down ? 'down' : e.left ? 'left' : e.right ? 'right' : null;
    if (dir) {
      const boxes = buttons.map(b => {
        const r = b.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      focus(buttons[nextInDirection(boxes, at, dir)]);
    }
    if (e.a) {
      // nothing chosen yet: the first press only shows where you are
      if (at < 0) focus(buttons[0]);
      else if (performance.now() - playedUntil > PAD_AFTER_GAME_MS && !slider) buttons[at].click();
    }
    if (e.b) {
      if (mode === 'paused') resume();
      else buttons.find(b => b.textContent === t('menu.back'))?.click();
    }
  }
  // the mouse takes over again: drop the controller's highlight
  addEventListener('pointermove', () => {
    padFocused?.classList.remove('pad-focus');
    padFocused = null;
  });
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
    // Space (and the jump key) would scroll or press a focused button; in a game the arrow keys and
    // their neighbours would scroll the page the game is embedded in
    if (e.code === 'Space' || (mode === 'playing' && (e.code === settings.bindings.jump || SCROLL_KEYS.has(e.code)))) e.preventDefault();
    // repeats of a held key are let through, so keys still held after a pause work again;
    // the keyboard only counts the first press for one-off actions
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.repeat) return;
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing' && e.code === settings.bindings.zoom && !e.repeat) zoomedOut = !zoomedOut;
    // the team key: who is in the team and how many lives each has, for ten seconds
    if (mode === 'playing' && e.code === settings.bindings.team && !e.repeat) hud.showTeam(10);
    // the map key: the minimap off or on again, remembered
    if (mode === 'playing' && e.code === settings.bindings.map && !e.repeat) {
      settings.showMap = !settings.showMap;
      saveSettings(settings);
    }
    // V (or the player's view key): first person on or off; the mouse gets captured to turn the view
    // (not when the LAN host fixed the view)
    // (nor in the Town, which is walked in first person only)
    const inTown = view().map.id === 'waldsee' && view().run.stage === 'floor';
    const fixedView = inTown || (role === 'host' ? host?.viewMode !== 'both' : role === 'client' ? client?.viewMode !== 'both' : false);
    if (mode === 'playing' && e.code === settings.bindings.view && !e.repeat && !fixedView) lockPointer(!keyboard.firstPerson);
    // a versus vote in the lobby: 1 or 2
    if (mode === 'lobby' && (e.code === 'Digit1' || e.code === 'Digit2') && (host?.voteInfo() || client?.vote)) lanActions.vote(e.code === 'Digit1' ? 0 : 1);
    // Tab, held: the board of who stands where (and Tab does not walk through the page's buttons meanwhile)
    if (e.code === 'Tab' && (mode === 'playing' || mode === 'paused')) {
      e.preventDefault();
      boardHeld = mode === 'playing';
    }
    if (mode === 'playing') keyboard.keyDown(e.code, performance.now(), e.repeat);
  });
  addEventListener('keyup', e => {
    if (e.code === 'Tab') boardHeld = false;
    keyboard.keyUp(e.code, performance.now());
  });
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
  addEventListener('blur', () => {
    boardHeld = false;
    if (role === 'solo') pause();
    else keyboard.releaseAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && role === 'solo') pause();
  });
  addEventListener('pointerdown', () => {
    if (mode === 'title' && audio === null) {
      ensureAudio();
      playBase('menu');
    }
  }, { once: true });
  addEventListener('beforeunload', () => leaveLan(false));

  setHudVisible(false);
  screens.title();
  // dev: ?split=1 starts the demo in split screen
  if (params.has('split')) settings.localPlayers = 2;
  // dev: ?map=race starts a Single floor demo on that map
  if (params.get('map')) settings.quickMap = params.get('map')!;
  // dev: &split=1 starts with two players on this screen
  if (import.meta.env.DEV && params.has('split')) settings.localPlayers = 2;
  // dev: ?versus=team|ffa starts a versus match with bots right away
  if (params.has('versus')) {
    settings.versusMode = params.get('versus') === 'team' ? 'team' : 'ffa';
    // dev: &size=10 fills the match up with bots; &rule=score|rounds|… picks the rule
    if (import.meta.env.DEV && Number(params.get('size')) > 1) settings.versusSize = Number(params.get('size'));
    if (import.meta.env.DEV && params.get('rule')) settings.versusRule = params.get('rule') as typeof settings.versusRule;
    // dev: &map=helipad plays the match on that arena
    if (import.meta.env.DEV && params.get('map')) settings.versusMap = params.get('map')!;
    if (import.meta.env.DEV && params.has('demo')) settings.versusDiscovery = false;
    newVersusGame();
    // dev: &crown=1 gives the player the lead and Quad Damage, to look at the crown and the glow
    if (import.meta.env.DEV && params.has('crown') && solo.versus) {
      solo.versus.scores[solo.players[0].id] = 5;
      solo.players[0].quadUntil = Number.MAX_SAFE_INTEGER;
    }
    // dev: &all=1 hands the player every weapon of the game, at level 3
    if (import.meta.env.DEV && params.has('all')) solo.players[0].weapons = ALL_WEAPONS.map(kind => ({ kind, level: 3, cooldown: 0 }));
    // dev: &view=top keeps the camera above the arena (for recordings)
    if (params.get('view') === 'top') keyboard.setFirstPerson(false, { x: 0, z: -1 });
  } else if (params.has('demo')) newSoloGame(params.get('mode') === 'run' ? 'run' : params.get('mode') === 'brawl' ? 'brawl' : 'quick');
  if (import.meta.env.DEV && params.has('capture')) {
    // dev only (?capture=1): time only moves when the recorder asks, so recordings are smooth
    let clock = 0;
    (window as unknown as { __advance: (ms: number) => void }).__advance = ms => loop.frame((clock += ms));
    // (and a recorder may steer: the game being played and the keyboard, whose view it turns)
    (window as unknown as { __director: object }).__director = { sim: () => solo, keyboard, showroom: (at: Parameters<NonNullable<typeof showroom>>[0]) => showroom?.(at) };
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

/** Dev helper (?demo=1|rare|nest&warp=ticks, &boss=kind): armed player with coins. */
function applyDemo(sim: SimState) {
  const all: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'bananaMine', 'bomb', 'discoBall'];
  // (&all=1: every weapon of the game, at level 3)
  sim.players[0].weapons = params.has('all') ? ALL_WEAPONS.map(kind => ({ kind, level: 3, cooldown: 0 })) : all.map(kind => ({ kind, level: 2, cooldown: 0 }));
  sim.players[0].coins = 200;
  // (&all=1 also straps a jetpack on, with a full tank)
  if (params.has('all')) Object.assign(sim.players[0], { jetpack: true, jetFuel: 300 });
  // ?demo=1&boss=rex|rhino|megaBlock|worm|kraken (&map=…): just that boss, on that floor
  const bossKind = params.get('boss');
  if (bossKind && ['megaBlock', 'worm', 'rex', 'kraken', 'rhino', 'dominik', 'spider', 'witch', 'heli'].includes(bossKind)) {
    sim.enemies = [];
    sim.nests = [];
    sim.boss = null;
    sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    void import('./sim/systems/boss').then(m => {
      // (&fall=1: it falls at once, close by, to look at what it leaves behind)
      const p = sim.players[0].pos;
      m.spawnBoss(sim, bossKind as 'rex', params.has('fall') ? { x: p.x, z: p.z - 5 } : undefined);
      if (params.has('fall')) for (const e of sim.enemies) e.hp = 0;
      // (&hp=0.5: it comes with this share of its health, so its later phases are a moment away; &god=1: nothing hurts the player)
      if (params.has('hp')) for (const e of sim.enemies) e.hp = e.maxHp * Number(params.get('hp'));
      if (params.has('god')) sim.players[0].invulnUntil = Number.MAX_SAFE_INTEGER;
      // (dev: &phase2=seconds: that long after the start it is hurt into its second phase, to look at what comes then)
      if (import.meta.env.DEV && params.has('phase2'))
        setTimeout(() => {
          const body = sim.enemies.find(e => e.id === sim.boss?.enemyId);
          if (body) body.hp = Math.min(body.hp, body.maxHp * 0.6);
        }, Number(params.get('phase2')) * 1000);
    });
  }
  // ?demo=dominik: Angry Dominik on show. He stands still in the open and the camera circles him (&act=1: he
  // fights, &act=stand: he attacks without leaving his spot, &r=… and &h=… set the circle's radius and height, &look=… the height it looks at from close by)
  if (params.get('demo') === 'dominik') {
    sim.enemies = [];
    sim.nests = [];
    sim.boss = null;
    sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    sim.players[0].invulnUntil = Number.MAX_SAFE_INTEGER;
    void import('./sim/systems/boss').then(m => {
      const at = { x: sim.map.w / 2, z: sim.map.h / 2 };
      m.spawnBoss(sim, 'dominik', at);
      const body = sim.enemies.find(e => e.id === sim.boss?.enemyId);
      if (body && params.get('act') !== '1') {
        body.speed = 0;
        body.dir = { x: 0, z: 1 };
        // (&act=stand: he stays where he is, but attacks)
        if (!params.has('act')) sim.boss!.nextAttackAt = Number.MAX_SAFE_INTEGER;
      }
      showroom?.({ x: body?.pos.x ?? at.x, z: body?.pos.z ?? at.z, height: Number(params.get('h')) || 4.3, radius: Number(params.get('r')) || 7, ...(params.has('look') ? { look: Number(params.get('look')) } : {}) });
    });
  }
  // ?demo=witch&map=waldsee: the witch on show beside her fire (on another map: in its middle), and the camera
  // circles her (&angle=…: it stands still). She stands and looks about (&act=1: she fights, &act=stand: she attacks without walking; &face=glare:
  // the glaring face; &dance=1: she dances round the fire with the small ones; &r=…, &h=…, &look=… as for Dominik)
  if (params.get('demo') === 'witch') {
    sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    sim.players[0].invulnUntil = Number.MAX_SAFE_INTEGER;
    void Promise.all([import('./sim/systems/boss'), import('./sim/config/floor-waldsee')]).then(([m, town]) => {
      if (sim.boss?.kind !== 'witch') {
        sim.enemies = [];
        sim.nests = [];
        sim.boss = null;
        m.spawnBoss(sim, 'witch', sim.map.id === 'waldsee' ? town.WALDSEE_FIRE : { x: sim.map.w / 2, z: sim.map.h / 2 });
      }
      const b = sim.boss!, w = b.witch!;
      const body = sim.enemies.find(e => e.id === b.enemyId);
      sim.enemies = sim.enemies.filter(e => e === body);
      if (params.get('face') === 'glare') {
        w.face = 'glare';
        w.turnedAt = sim.tick;
      }
      if (params.get('act') !== '1') {
        w.speed = 0;
        if (!params.has('act')) b.nextAttackAt = Number.MAX_SAFE_INTEGER;
      }
      // (dev: &from=x,z: she stands there first, to watch her fly from afar to her fire)
      if (import.meta.env.DEV && params.has('from') && body) {
        const [x, z] = params.get('from')!.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(z)) body.pos = { x, z };
      }
      // (into the second phase, above half her health: she flies to her fire and the dance starts, the mask stays as it is)
      if (params.has('dance') && body) body.hp = body.maxHp * 0.6;
      const at = params.has('dance') ? w.fire : body?.pos ?? w.fire;
      // (&angle=…: the camera stands still at that angle, 0 in front of her)
      showroom?.({ x: at.x, z: at.z, height: Number(params.get('h')) || 2.6, radius: Number(params.get('r')) || (params.has('dance') ? 10 : 6), ...(params.has('look') ? { look: Number(params.get('look')) } : {}), ...(params.has('angle') ? { angle: (Number(params.get('angle')) * Math.PI) / 180 } : {}) });
    });
  }
  // &calm=1: nothing on the map but you (no monsters, no nests, no alarm): to walk about and look
  if (import.meta.env.DEV && params.has('calm')) {
    sim.enemies = [];
    sim.hordes = [];
    sim.nests = [];
    sim.boss = null;
    sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
  }
  // &see=x,z,height,radius,angle: the camera looks at that spot of the map from there (to look at a place)
  if (import.meta.env.DEV && params.has('see')) {
    const [x, z, height = 14, radius = 16, angle = 0] = params.get('see')!.split(',').map(Number);
    showroom?.({ x, z, height, radius, angle });
  }
  // &as=babyDino|cat|…: play this demo as that character, owned or not
  if (params.has('as')) sim.players[0].character = params.get('as') as never;
  if (params.has('crowd'))
    sim.players.slice(1).forEach(p => {
      if (params.has('as')) p.character = params.get('as') as never;
      // (they are only there to be looked at: far too tough to go down. Not invulnerable, or they would blink)
      p.hp = p.maxHp = 1e7;
    });
  // &mini=1: the small Angry Dominik from the wall logo, right away
  if (params.has('mini')) void import('./sim/systems/mini-dominik').then(m => m.releaseMiniDominik(sim, { x: sim.players[0].pos.x, z: sim.players[0].pos.z - 4 }));
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
    // (&dummy=1: a few monsters that stand still up the screen from the player, to aim at in peace)
    if (params.has('dummy')) {
      sim.enemies = [];
      sim.nests = [];
      sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
      sim.players[0].invulnUntil = Number.MAX_SAFE_INTEGER;
      void import('./sim/systems/enemies').then(m => {
        const p = sim.players[0].pos;
        for (const [dx, dz, kind] of [[0, -6, 'tank'], [-4, -7, 'rammer'], [4, -5, 'shooter']] as const) m.spawnEnemy(sim, kind, { x: p.x + dx, z: p.z + dz }).speed = 0;
      });
    }
  }
  // ?demo=ride&kind=unicorn: one of each vehicle (that kind first) parked by the player, to hear them
  if (params.get('demo') === 'ride') {
    void import('./sim/systems/vehicles').then(m => {
      const p = sim.players[0].pos;
      const first = (params.get('kind') as VehicleKind | null) ?? 'kart';
      const kinds = [first, ...(['kart', 'unicorn', 'roller', 'hoverboard', 'police'] as const).filter(k => k !== first)];
      kinds.forEach((kind, i) => m.addVehicle(sim, kind, { x: p.x + (i - 2) * 1.6, z: p.z + 1.5 }, 0));
    });
  }
  const floorParam = Number(params.get('floor'));
  if (floorParam > 0 && sim.run.mode === 'run') void import('./sim/systems/run').then(m => m.enterFloor(sim, Math.min(floorParam, sim.run.floors.length - 1)));
  if (params.get('demo') === 'shop' && sim.run.mode === 'run') void import('./sim/systems/shop').then(m => m.openShop(sim));
  // ?demo=zoo: one of every monster in a row in front of the player, crawling slowly (to look at them)
  if (params.get('demo') === 'zoo') {
    void import('./sim/systems/enemies').then(m => {
      // (&witches=1: little witches only, every third of them on her broom)
      const all = ['blob', 'hunter', 'tank', 'splitter', 'shooter', 'bomber', 'rammer', 'swarmer', 'shielder', 'healer', 'teleporter', 'croc', 'monkey', 'trex'] as const;
      const kinds = params.has('witches') ? all.slice(0, 7).map(() => 'witchling' as const) : all;
      const p = sim.players[0];
      p.invulnUntil = Number.MAX_SAFE_INTEGER;
      p.pos.z += 5;
      // (and the camera looks at them from near by: &angle=… from another side, &h=… and &r=… its height and distance)
      if (params.has('witches')) showroom?.({ x: p.pos.x - 1.9, z: p.pos.z - 3.2, height: Number(params.get("h")) || 1.5, radius: Number(params.get("r")) || 3.2, angle: Number(params.get('angle')) || 0 });
      // two rows above the player, so they walk toward the camera
      kinds.forEach((k, i) => {
        const e = m.spawnEnemy(sim, k, { x: p.pos.x + ((i % 7) - 3) * 1.9, z: p.pos.z - (i >= 7 ? 5.6 : 3.2) });
        e.speed *= 0.05;
        // (&pop=1: they all burst at once, &pop=elite as elites: to look at how monsters die)
        if (params.has('pop')) {
          e.elite = params.get('pop') === 'elite';
          // (a mine under each of them that goes off after half a second: so they die by the rules, with the event)
          sim.mines.push({ id: sim.nextId++, pos: { ...e.pos }, ownerId: p.id, damage: 1e6, armedAt: sim.tick + 30, expiresAt: sim.tick + 600 });
        }
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
  // ?demo=logo: standing just below the AmannLabs floor logo (&logo=wall: in front of the wall one)
  if (params.get('demo') === 'logo') {
    void import('./sim/map/logo-spots').then(m => {
      const spot = m.logoSpots(sim.map).find(s => s.kind === (params.get('logo') === 'wall' ? 'wall' : 'floor'));
      if (!spot) return;
      const p = sim.players[0];
      // (&on=1: standing on it, which wakes its A up)
      if (spot.kind === 'floor') p.pos = { x: spot.tx + spot.w / 2 + (params.has('on') ? 1 : 0), z: spot.tz + (params.has('on') ? 0.5 : spot.h + 1.5) };
      else p.pos = { x: spot.tx + 0.5 + (spot.along === 'x' ? spot.w / 2 : 0) + spot.facing.x * 3, z: spot.tz + 0.5 + (spot.along === 'z' ? spot.w / 2 : 0) + spot.facing.z * 3 };
      sim.enemies = [];
    });
  }
  // ?demo=cast: ten players in a row, facing the camera that looks at them from the front (&h=… and &r=… set
  // its height and distance, &angle=… looks from another side, &turn=1 lets it circle them)
  // &pose=down|kart|unicorn|jump|fly|climb|dash|win puts them all in that state, &fp=1 looks at them through
  // the first player's eyes, &view=top from the game's own camera
  if (params.get('demo') === 'cast') {
    sim.enemies = [];
    sim.nests = [];
    sim.alarm.nextAt = Number.MAX_SAFE_INTEGER;
    const fp = params.has('fp'), top = params.get('view') === 'top';
    const at = { x: sim.players[0].pos.x, z: sim.players[0].pos.z };
    const row = sim.players.slice(fp ? 1 : 0);
    const gap = Number(params.get('gap')) || 1.5;
    const pose = params.get('pose');
    // &weapon=bomb|rare|…: what they all hold (&weapon=cycle: each the next one of the list, starting at &shift=…)
    const held = [...ALL_WEAPONS, 'rare'];
    for (const [i, p] of sim.players.entries()) {
      const weapon = params.get('weapon') === 'cycle' ? held[(i + (Number(params.get('shift')) || 0)) % held.length] : params.get('weapon');
      if (weapon === 'rare') Object.assign(p, { rare: { kind: 'slushMachine', until: Number.MAX_SAFE_INTEGER, cooldown: 0 }, rareSelected: true });
      else if (weapon) Object.assign(p, { weapons: [{ kind: weapon as WeaponKind, level: 2, cooldown: 0 }], selected: 0 });
    }
    // one of every character, or (&cast=earned) the earned one first, (&cast=bots) ten bots, (&cast=mix) players
    // and bots in turn, (&cast=auto) what the game picks for ten names
    const kinds = params.get('cast') === 'earned' ? [...EARNED_CHARACTERS, ...FREE_CHARACTERS] : FREE_CHARACTERS;
    if (!params.has('cast') || params.get('cast') === 'earned') sim.players.forEach((p, i) => (p.character = kinds[(i + (Number(params.get('from')) || 0)) % kinds.length]));
    row.forEach((p, i) => {
      p.pos = { x: at.x + (i - (row.length - 1) / 2) * gap, z: at.z };
      p.aim = p.facing = { x: 0, z: 1 };
      p.aimPoint = { x: p.pos.x, z: p.pos.z + 4 };
      p.invulnUntil = 0;
      if (pose === 'down') p.downUntil = Number.MAX_SAFE_INTEGER;
      if (pose === 'jump') p.air = Math.round(JUMP_TICKS * (0.3 + 0.07 * i));
      if (pose === 'fly') Object.assign(p, { jetpack: true, jetFuel: 9999, flying: true });
      if (pose === 'pack') p.jetpack = true;
      if (pose === 'dash') Object.assign(p, { dashTicks: 600, dashDir: { x: 0, z: 0 } });
      if (pose === 'climb') p.climb = { ticks: 30, top: { ...p.pos } };
    });
    // the first player steps back and looks at the others
    if (fp) sim.players[0].pos = { x: at.x, z: at.z + (Number(params.get('back')) || 3.2) };
    if (pose === 'win') sim.phase = 'won';
    if (pose === 'kart' || pose === 'unicorn' || pose === 'hoverboard' || pose === 'roller')
      void import('./sim/systems/vehicles').then(m => {
        sim.vehicles = [];
        for (const p of row) {
          const v = m.addVehicle(sim, pose === 'kart' ? 'kart' : pose, p.pos, 0);
          v.driverId = p.id;
          p.vehicleId = v.id;
        }
      });
    if (!fp && !top) showroom?.({ x: at.x + (Number(params.get('x')) || 0), z: at.z, height: Number(params.get('h')) || 2.2, radius: Number(params.get('r')) || 9, angle: params.has('turn') ? undefined : ((Number(params.get('angle')) || 0) * Math.PI) / 180 });
  }
  // &ride=kart|roller|hoverboard|unicorn|police: every player on this computer sits in one, in first person
  // (&boost=1: with a boost that does not end, &tilt=-0.5: looking down), to look at the view from inside
  const ride = import.meta.env.DEV ? params.get('ride') : null;
  if (ride && ['kart', 'roller', 'hoverboard', 'unicorn', 'police'].includes(ride))
    void import('./sim/systems/vehicles').then(m => {
      for (const p of sim.players) {
        const v = m.addVehicle(sim, ride as VehicleKind, p.pos, 0);
        v.driverId = p.id;
        p.vehicleId = v.id;
        if (params.has('boost')) p.boostUntil = Number.MAX_SAFE_INTEGER;
      }
      lookOut?.();
    });
  // ?demo=garage: every vehicle in a row next to the player (to look at them)
  if (params.get('demo') === 'garage') {
    void import('./sim/systems/vehicles').then(m => {
      sim.enemies = [];
      sim.vehicles = [];
      (['kart', 'kart', 'roller', 'hoverboard', 'unicorn'] as const).forEach((kind, i) => m.addVehicle(sim, kind, { x: sim.players[0].pos.x - 11 + i * 2.2, z: sim.players[0].pos.z - 1 }, 0));
    });
  }
  // ?demo=unicorn: a unicorn right next to the player
  if (params.get('demo') === 'unicorn') void import('./sim/systems/vehicles').then(m => m.addVehicle(sim, 'unicorn', { x: sim.players[0].pos.x + 2, z: sim.players[0].pos.z - 1 }, 0));
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
