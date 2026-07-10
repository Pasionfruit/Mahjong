/**
 * Desktop = a fine pointer (mouse/trackpad) is available. Keyboard-driven
 * games (Bomberman) are gated on this; touch-only phones/tablets fail it.
 */
export function isDesktop(): boolean {
  return window.matchMedia('(pointer: fine)').matches;
}
