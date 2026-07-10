import { THEMES, TURN_TIMER_CHOICES } from '@shared/settings';
import type { UtttSettings } from '@shared/uttt';

export function sanitizeSettings(
  current: UtttSettings,
  patch: Partial<UtttSettings>,
): UtttSettings | null {
  const next = { ...current };
  if (patch.turnTimerSeconds !== undefined) {
    if (!TURN_TIMER_CHOICES.includes(patch.turnTimerSeconds)) return null;
    next.turnTimerSeconds = patch.turnTimerSeconds;
  }
  if (patch.theme !== undefined) {
    if (!THEMES.includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}
