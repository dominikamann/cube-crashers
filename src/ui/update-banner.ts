import { t } from '../i18n';

export type UpdateEvent =
  | { type: 'available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'manual'; version: string };

export interface UpdateBridge {
  state(): Promise<UpdateEvent | null>;
  install(): void;
  download(): void;
  on(cb: (e: UpdateEvent) => void): () => void;
}

/** A small banner in the corner: new version downloading → ready to install on restart (or a download link). */
export function createUpdateBanner(root: HTMLElement, bridge: UpdateBridge | undefined, click: () => void): void {
  if (!bridge) return;
  const el = document.createElement('div');
  el.className = 'update-banner txt';
  el.style.display = 'none';
  root.append(el);
  let version = '';

  function show(e: UpdateEvent) {
    el.innerHTML = '';
    el.style.display = '';
    const text = document.createElement('span');
    if (e.type === 'available' || e.type === 'progress') {
      if (e.type === 'available') version = e.version;
      text.textContent = t('update.downloading', { version, pct: e.type === 'progress' ? e.percent : 0 });
      el.append(text);
      return;
    }
    version = e.version;
    text.textContent = t(e.type === 'ready' ? 'update.ready' : 'update.manual', { version });
    const b = document.createElement('button');
    b.className = 'btn alt small';
    b.textContent = t(e.type === 'ready' ? 'update.restart' : 'update.download');
    b.addEventListener('click', () => {
      click();
      if (e.type === 'ready') bridge!.install();
      else bridge!.download();
    });
    el.append(text, b);
  }

  void bridge.state().then(e => e && show(e));
  bridge.on(show);
}
