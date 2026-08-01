import type { ComponentType } from 'react';
import { useStore, type Wing } from '../store';
import { leaveParty } from '../socket';
import { dailyGames } from '../games/catalog';
import { useDailyProgress } from '../arcade/useDailyProgress';
import {
  IconCalendarCheck,
  IconLink,
  IconPartyPopper,
  IconUser,
  IconZenLotus,
} from './icons';

const WING_TABS: { wing: Wing; label: string; Icon: ComponentType }[] = [
  { wing: 'connect', label: 'Connect', Icon: IconLink },
  { wing: 'party', label: 'Party', Icon: IconPartyPopper },
  { wing: 'daily', label: 'Daily', Icon: IconCalendarCheck },
  { wing: 'zen', label: 'Zen', Icon: IconZenLotus },
  { wing: 'profile', label: 'Profile', Icon: IconUser },
];

/**
 * The wing switcher, rendered twice: `dock` is the app-wide fixed bottom bar
 * on phones (visible on every screen, including mid-game); the default is the
 * inline pill row on the Home screen for wider viewports. CSS shows exactly
 * one of the two at any width.
 */
export default function WingNav({ dock = false }: { dock?: boolean }) {
  const wing = useStore((s) => s.wing);
  const dailyDone = useDailyProgress();
  const dailies = dailyGames();
  const doneCount = dailies.filter((g) => dailyDone.has(g.id)).length;

  function go(next: Wing) {
    const s = useStore.getState();
    // Tapping the nav from inside a game bails out to Home first.
    if (s.localGame) s.setLocalGame(null);
    if (s.lobby) leaveParty();
    s.setWing(next);
  }

  return (
    <nav className={`home-tabs ${dock ? 'wing-dock' : 'wing-inline'}`}>
      {WING_TABS.map(({ wing: w, label, Icon }) => (
        <button
          key={w}
          className={`home-tab${wing === w ? ' active' : ''}`}
          onClick={() => go(w)}
        >
          <span className="home-tab-icon">
            <Icon />
          </span>
          <span className="home-tab-label">{label}</span>
          {w === 'daily' && (
            <span className={`daily-tab-count${doneCount === dailies.length ? ' complete' : ''}`}>
              {doneCount}/{dailies.length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
