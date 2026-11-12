/**
 * How much the interface grows on a big screen: it is laid out for about 1280 x 760 CSS pixels and keeps that
 * size on anything smaller, so a TV or a 4K monitor shows the same layout, just larger.
 */
export const UI_BASE = { w: 1280, h: 760 };
export const UI_MAX_ZOOM = 3;

export function uiZoom(width: number, height: number): number {
  return Math.round(Math.max(1, Math.min(width / UI_BASE.w, height / UI_BASE.h, UI_MAX_ZOOM)) * 100) / 100;
}
