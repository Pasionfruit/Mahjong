import { useEffect, useState, type ComponentType } from 'react';
import { useStore, type Wing } from '../store';
import { leaveParty } from '../socket';
import { dailyGames } from '../games/catalog';
import { useDailyProgress } from '../arcade/useDailyProgress';
import {
  IconCalendarCheck,
  IconClose,
  IconGear,
  IconMenu,
  IconPartyPopper,
  IconTrophy,
  IconZenLotus,
} from './icons';

const WING_TABS: { wing: Wing; label: string; Icon: ComponentType }[] = [
  { wing: 'party', label: 'Party', Icon: IconPartyPopper },
  { wing: 'daily', label: 'Daily', Icon: IconCalendarCheck },
  { wing: 'zen', label: 'Zen', Icon: IconZenLotus },
  { wing: 'profile', label: 'Stats', Icon: IconTrophy },
  { wing: 'settings', label: 'Settings', Icon: IconGear },
];

/**
 * The wing switcher, rendered twice: `dock` is the app-wide phone nav
 * (visible on every screen, mid-game included); the default is the inline
 * pill row on the Home screen for wider viewports. CSS shows exactly one.
 *
 * On phones this is a hamburger + full-screen sheet, NOT a fixed bottom
 * bar. The bar version kept breaking on iOS in ways that couldn't be fixed
 * from this side: it depended on env(safe-area-inset-bottom), dynamic
 * viewport units, and position:fixed behaving predictably alongside a
 * scroll container — and iOS standalone (home-screen) mode gets all three
 * subtly wrong, leaving a gap beneath the bar or letting content bleed
 * through it. A corner button plus an inset:0 overlay depends on none of
 * that, so the whole class of bugs goes away rather than being re-patched.
 */
export default function WingNav({ dock = false }: { dock?: boolean }) {
  const wing = useStore((s) => s.wing);
  const dailyDone = useDailyProgress();
  const dailies = dailyGames();
  const doneCount = dailies.filter((g) => dailyDone.has(g.id)).length;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function go(next: Wing) {
    const s = useStore.getState();
    // Tapping the nav from inside a game bails out to Home first.
    if (s.localGame) s.setLocalGame(null);
    if (s.lobby) leaveParty();
    s.setWing(next);
    setOpen(false);
  }

  const items = WING_TABS.map(({ wing: w, label, Icon }) => (
    <button key={w} className={`home-tab${wing === w ? ' active' : ''}`} onClick={() => go(w)}>
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
  ));

  if (!dock) return <nav className="home-tabs wing-inline">{items}</nav>;

  return (
    <div className="wing-dock">
      <button
        className="wing-burger"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <IconClose /> : <IconMenu />}
        {/* Quiet nudge that dailies are outstanding, since the count badge
            now lives inside the closed sheet. */}
        {!open && doneCount < dailies.length && <span className="wing-burger-dot" />}
      </button>

      {open && (
        <div className="wing-sheet" role="dialog" aria-label="Navigation">
          <button className="wing-sheet-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <nav className="home-tabs wing-sheet-tabs">{items}</nav>
        </div>
      )}
    </div>
  );
}
