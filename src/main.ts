import { t } from './i18n';
import { createRenderer } from './render/renderer';
import { map01 } from './sim/config/map01';
import { createSim, stepSim } from './sim/sim';
import { startBoss } from './sim/systems/boss';
import { DT, type Command, type SimEvent, type WeaponKind } from './sim/types';

document.title = t('title');
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<canvas id="game"></canvas>';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: '#000' });
Object.assign(canvas.style, { width: '100vw', height: '100vh', display: 'block' });

const params = new URLSearchParams(location.search);
const sim = createSim(map01, Date.now() & 0xffffffff);
if (params.has('demo')) {
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

const keys = new Set<string>();
addEventListener('keydown', e => keys.add(e.code));
addEventListener('keyup', e => keys.delete(e.code));

const renderer = createRenderer(canvas, map01);
let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  const events: SimEvent[] = [];
  let steps = 0;
  while (acc >= DT && steps < 5) {
    const dir = {
      x: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      z: (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0),
    };
    const cmds: Command[] = [{ type: 'move', playerId: 0, dir }];
    stepSim(sim, cmds);
    events.push(...sim.events);
    acc -= DT;
    steps++;
  }
  renderer.render(sim, acc / DT, events, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
