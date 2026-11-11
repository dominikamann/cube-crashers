import { createMixer } from './mixer';
import { createMusic, TRACK_IDS } from './music';
import { SOUNDS, type SoundId } from './sfx';

/** Dev page (?sound=1): one button per sound and per music track, for listening checks. */
export function showSoundboard(root: HTMLElement): void {
  const ctx = new AudioContext();
  const mixer = createMixer(ctx);
  const music = createMusic(ctx, mixer.musicBus);
  root.innerHTML = '';
  Object.assign(root.style, { font: '14px monospace', padding: '16px', color: '#fff', background: '#1a1840', minHeight: '100vh' });
  const add = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.margin = '4px';
    b.onclick = () => {
      void ctx.resume();
      fn();
    };
    root.append(b);
  };
  for (const id of Object.keys(SOUNDS) as SoundId[]) add(id, () => mixer.play(id));
  root.append(document.createElement('hr'));
  for (const id of TRACK_IDS) add(`♪ ${id}`, () => music.playTrack(id));
  add('■ stop music', () => music.playTrack(null));
  add('💥 mash 40 explosions', () => {
    for (let i = 0; i < 40; i++) mixer.play('enemyKilled', 1, true);
  });
}
