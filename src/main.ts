import '@fontsource/press-start-2p/400.css';
import './ui/ui.css';
import { createMixer, type Mixer } from './audio/mixer';
import { createMusic, type MusicPlayer } from './audio/music';
import { soundsForEvent } from './audio/sfx';
import { t } from './i18n';
import { Keyboard } from './input/keyboard';
import { createLoop } from './loop';
import { createRenderer } from './render/renderer';
import { floor01 } from './sim/config/floor01';
import { createSim, stepSim } from './sim/sim';
import { TICK_RATE, type RareKind, type SimEvent, type SimState, type WeaponKind } from './sim/types';
import { createBuildMenu } from './ui/build-menu';
import { createHud } from './ui/hud';
import { buildRunLog, saveRunLog } from './runlog';
import { totalKills } from './sim/systems/stats';
import { createScreens, loadSettings, recordScore } from './ui/screens';

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
  const renderer = createRenderer(canvas, floor01);
  const keyboard = new Keyboard();
  const settings = loadSettings();

  let sim: SimState = createSim(floor01, 1);
  let mode: 'title' | 'playing' | 'paused' | 'over' = 'title';
  let frameEvents: SimEvent[] = [];
  const mouse = { x: innerWidth / 2, y: innerHeight / 3 };
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
    keyboard.steerWithMouse = settings.steerWithMouse;
  }
  applySettings();

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
      keyboard.setAim(renderer.groundPoint(mouse.x, mouse.y));
      stepSim(sim, keyboard.commands(sim, 0, performance.now()));
      keyboard.onEvents(sim.events);
      frameEvents.push(...sim.events);
    },
    (alpha, frameDt) => {
      // the crosshair replaces the mouse pointer while playing
      canvas.style.cursor = mode === 'playing' ? 'none' : '';
      renderer.render(sim, alpha, frameEvents, frameDt);
      hud.update(sim, frameEvents, keyboard.buildMenuOpen, performance.now() / 1000);
      buildMenu.update(sim, keyboard.buildMenuOpen && mode === 'playing', frameEvents);
      if (audio) {
        for (const e of frameEvents) for (const snd of soundsForEvent(e)) audio.mixer.play(snd.id, snd.pitch);
        for (const e of frameEvents) {
          if (e.type === 'alarmChanged') audio.music.playTrack(e.level >= 5 ? 'boss' : 'battle');
          if (e.type === 'gameWon' || e.type === 'gameLost') audio.music.playTrack(null);
        }
      }
      for (const e of frameEvents) {
        if (e.type === 'gameWon' || e.type === 'gameLost') finish(e.type === 'gameWon');
      }
      frameEvents = [];
    },
  );

  function finish(won: boolean) {
    mode = 'over';
    keyboard.releaseAll();
    saveRunLog(buildRunLog(sim));
    const summary = {
      score: sim.score,
      seconds: sim.tick / TICK_RATE,
      kills: totalKills(sim),
      maxCombo: sim.stats.maxCombo,
      credits: sim.credits,
      nestsDestroyed: sim.nests.filter(n => n.state === 'destroyed').length,
      nests: sim.nests.length,
      best: recordScore(sim.score),
    };
    setTimeout(() => {
      hud.setVisible(false);
      screens.result(won, summary);
    }, 1800);
  }

  function newGame() {
    const fixed = Number(params.get('seed'));
    sim = createSim(floor01, fixed > 0 ? fixed : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
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
    sim = createSim(floor01, 1);
    hud.setVisible(false);
    screens.title();
    if (audio) audio.music.playTrack('menu');
  }

  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
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

/** Dev helper (?demo=1&warp=ticks): armed player with coins. */
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
