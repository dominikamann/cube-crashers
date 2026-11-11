import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, type MusicPlayer } from './audio/music';
import { soundsForEvent } from './audio/sfx';
import { t } from './i18n';
import { Keyboard } from './input/keyboard';
import { createLoop } from './loop';
import { createRenderer } from './render/renderer';
import { map01 } from './sim/config/map01';
import { createSim, stepSim } from './sim/sim';
import { startBoss } from './sim/systems/boss';
import { TICK_RATE, type SimEvent, type SimState, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
import { createScreens, loadSettings } from './ui/screens';

document.title = t('title');
const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);

if (params.has('sound')) {
  void import('./audio/soundboard').then(m => m.showSoundboard(app));
} else {
  startGame();
}

function startGame() {
  app.innerHTML = '<canvas id="game"></canvas>';
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const renderer = createRenderer(canvas, map01);
  const keyboard = new Keyboard();
  const settings = loadSettings();

  let sim: SimState = createSim(map01, 1);
  let mode: 'title' | 'playing' | 'paused' | 'over' = 'title';
  let frameEvents: SimEvent[] = [];
  let audio: { ctx: AudioContext; mixer: Mixer; music: MusicPlayer } | null = null;

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
  }

  const hud = createHud(app);
  const buildMenu = createBuildMenu(app, kind => keyboard.chooseTower(kind));
  const screens = createScreens(
    app,
    {
      play: newGame,
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
      if (mode !== 'playing') return;
      stepSim(sim, keyboard.commands(sim, 0, performance.now()));
      frameEvents.push(...sim.events);
    },
    (alpha, frameDt) => {
      renderer.render(sim, alpha, frameEvents, frameDt);
      hud.update(sim, frameEvents, keyboard.buildMenuOpen);
      buildMenu.update(sim, keyboard.buildMenuOpen && mode === 'playing', frameEvents);
      if (audio) {
        for (const e of frameEvents) for (const snd of soundsForEvent(e)) audio.mixer.play(snd.id, snd.pitch);
        for (const e of frameEvents) {
          if (e.type === 'bossSpawn') audio.music.playTrack('boss');
          if (e.type === 'bossDead') audio.music.playTrack('battle');
          if (e.type === 'gameWon' || e.type === 'gameLost') audio.music.playTrack(null);
        }
      }
      for (const e of frameEvents) {
        if (e.type === 'gameWon') finish(() => screens.won(e.stars, sim.players[0].coins, sim.tick / TICK_RATE));
        if (e.type === 'gameLost') finish(() => screens.lost(sim.wave.index + 1));
      }
      frameEvents = [];
    },
  );

  function finish(show: () => void) {
    mode = 'over';
    keyboard.releaseAll();
    setTimeout(() => {
      hud.setVisible(false);
      show();
    }, 1800);
  }

  function newGame() {
    sim = createSim(map01, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    if (params.has('demo')) applyDemo(sim);
    frameEvents = [];
    keyboard.releaseAll();
    screens.hide();
    hud.setVisible(true);
    mode = 'playing';
    loop.resume();
    ensureAudio().music.playTrack('battle');
  }

  function resume() {
    if (mode !== 'paused') return;
    screens.hide();
    mode = 'playing';
    loop.resume();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    keyboard.releaseAll();
    loop.pause();
    screens.pause();
  }

  function toTitle() {
    mode = 'title';
    sim = createSim(map01, 1);
    hud.setVisible(false);
    screens.title();
    if (audio) audio.music.playTrack('menu');
  }

  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (mode === 'playing') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (mode === 'playing') keyboard.keyDown(e.code, performance.now());
  });
  addEventListener('keyup', e => keyboard.keyUp(e.code));
  addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  addEventListener('pointerdown', () => {
    if (mode === 'title' && audio === null) ensureAudio().music.playTrack('menu');
  }, { once: true });

  hud.setVisible(false);
  screens.title();
  if (params.has('demo')) newGame();
  requestAnimationFrame(function frame(now) {
    loop.frame(now);
    requestAnimationFrame(frame);
  });
}

/** Dev helper (?demo=day|night&warp=ticks): armed player, towers, optional worm. */
function applyDemo(sim: SimState) {
  const all: WeaponKind[] = ['pixelBlaster', 'laserSword', 'candyCannon', 'hotdogSlinger', 'joystickBoomerang', 'discoBall'];
  sim.players[0].weapons = all.map(kind => ({ kind, level: 3, cooldown: 0 }));
  sim.players[0].coins = 200;
  sim.towers.push(
    { id: 90001, kind: 'laser', padId: 2, pos: { ...map01.pads[2].pos }, hp: 40, maxHp: 40, cooldown: 0 },
    { id: 90002, kind: 'popcorn', padId: 3, pos: { ...map01.pads[3].pos }, hp: 40, maxHp: 40, cooldown: 0 },
    { id: 90003, kind: 'frost', padId: 4, pos: { ...map01.pads[4].pos }, hp: 40, maxHp: 40, cooldown: 0 },
  );
  sim.wave.index = 2;
  if (params.get('demo') === 'night') startBoss(sim, 'worm');
  const warp = Number(params.get('warp') ?? 0);
  for (let i = 0; i < warp; i++) stepSim(sim, []);
}
