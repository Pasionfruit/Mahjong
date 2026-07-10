import {
  MAX_SETS_TO_WIN,
  MIN_SETS_TO_WIN,
  THEMES,
  TURN_TIMER_CHOICES,
  type GameSettings,
} from '@shared/settings';

/** Validate + merge a Mahjong settings patch; null if any field is invalid. */
export function sanitizeSettings(
  current: GameSettings,
  patch: Partial<GameSettings>,
): GameSettings | null {
  const next = { ...current };
  if (patch.includeFlowers !== undefined) {
    if (typeof patch.includeFlowers !== 'boolean') return null;
    next.includeFlowers = patch.includeFlowers;
  }
  if (patch.includeHonors !== undefined) {
    if (typeof patch.includeHonors !== 'boolean') return null;
    next.includeHonors = patch.includeHonors;
  }
  if (patch.openHands !== undefined) {
    if (typeof patch.openHands !== 'boolean') return null;
    next.openHands = patch.openHands;
  }
  if (patch.turnTimerSeconds !== undefined) {
    if (!TURN_TIMER_CHOICES.includes(patch.turnTimerSeconds)) return null;
    next.turnTimerSeconds = patch.turnTimerSeconds;
  }
  if (patch.setsToWin !== undefined) {
    if (patch.setsToWin !== null) {
      if (
        typeof patch.setsToWin !== 'number' ||
        !Number.isInteger(patch.setsToWin) ||
        patch.setsToWin < MIN_SETS_TO_WIN ||
        patch.setsToWin > MAX_SETS_TO_WIN
      ) {
        return null;
      }
    }
    next.setsToWin = patch.setsToWin;
  }
  if (patch.theme !== undefined) {
    if (!THEMES.includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}
