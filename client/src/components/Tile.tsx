import { isSuited, rankOf, type TileKind } from '@shared/tiles';

export type TileSize = 'xs' | 'sm' | 'md' | 'lg';

interface TileProps {
  /** null renders a face-down tile back. */
  kind: TileKind | null;
  size?: TileSize;
  selected?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_CHARS: Record<string, string> = { wE: '東', wS: '南', wW: '西', wN: '北' };

const RED = '#b3362b';
const BLUE = '#22508f';
const GREEN = '#2c6e3f';
const NAVY = '#28324e';
const PINK = '#a53860';

// Positions on a 60x84 viewBox for 1-9 items.
const LAYOUTS: [number, number][][] = [
  [],
  [[30, 42]],
  [
    [30, 25],
    [30, 59],
  ],
  [
    [17, 21],
    [30, 42],
    [43, 63],
  ],
  [
    [19, 26],
    [41, 26],
    [19, 58],
    [41, 58],
  ],
  [
    [18, 23],
    [42, 23],
    [30, 42],
    [18, 61],
    [42, 61],
  ],
  [
    [19, 22],
    [41, 22],
    [19, 42],
    [41, 42],
    [19, 62],
    [41, 62],
  ],
  [
    [15, 17],
    [30, 21],
    [45, 25],
    [19, 47],
    [41, 47],
    [19, 66],
    [41, 66],
  ],
  [
    [19, 16],
    [41, 16],
    [19, 34],
    [41, 34],
    [19, 52],
    [41, 52],
    [19, 70],
    [41, 70],
  ],
  [
    [17, 21],
    [30, 21],
    [43, 21],
    [17, 42],
    [30, 42],
    [43, 42],
    [17, 63],
    [30, 63],
    [43, 63],
  ],
];

function Dots({ rank }: { rank: number }) {
  const r = rank === 1 ? 13 : rank <= 4 ? 9.5 : rank <= 6 ? 8 : 6.5;
  return (
    <>
      {LAYOUTS[rank]!.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill={rank === 1 ? RED : BLUE}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1"
        />
      ))}
    </>
  );
}

function Sticks({ rank }: { rank: number }) {
  const h = rank <= 4 ? 20 : rank <= 6 ? 17 : 15;
  const w = rank <= 6 ? 7 : 6;
  return (
    <>
      {LAYOUTS[rank]!.map(([x, y], i) => (
        <g key={i}>
          <rect
            x={x - w / 2}
            y={y - h / 2}
            width={w}
            height={h}
            rx={w / 2}
            fill={GREEN}
          />
          <circle cx={x} cy={y} r={1.6} fill="#d5e8cf" />
        </g>
      ))}
    </>
  );
}

function cornerRank(rank: number) {
  return (
    <text x="7" y="13" fontSize="11" fontWeight="700" fill="rgba(0,0,0,0.45)" textAnchor="middle">
      {rank}
    </text>
  );
}

const CJK_FONT = "'Microsoft YaHei','Noto Sans CJK SC','PingFang SC',serif";

function Face({ kind }: { kind: TileKind }) {
  if (isSuited(kind)) {
    const rank = rankOf(kind);
    const suit = kind[0];
    if (suit === 'd') {
      return (
        <>
          <Dots rank={rank} />
          {cornerRank(rank)}
        </>
      );
    }
    if (suit === 'b') {
      return (
        <>
          <Sticks rank={rank} />
          {cornerRank(rank)}
        </>
      );
    }
    return (
      <>
        {cornerRank(rank)}
        <text x="30" y="40" fontSize="26" fontFamily={CJK_FONT} fill={NAVY} textAnchor="middle">
          {NUMERALS[rank - 1]}
        </text>
        <text x="30" y="71" fontSize="26" fontFamily={CJK_FONT} fill={RED} textAnchor="middle">
          萬
        </text>
      </>
    );
  }
  if (kind[0] === 'w') {
    return (
      <text x="30" y="54" fontSize="36" fontFamily={CJK_FONT} fill={NAVY} textAnchor="middle">
        {WIND_CHARS[kind]}
      </text>
    );
  }
  if (kind === 'gR' || kind === 'gG') {
    return (
      <text
        x="30"
        y="54"
        fontSize="36"
        fontFamily={CJK_FONT}
        fill={kind === 'gR' ? RED : GREEN}
        textAnchor="middle"
      >
        {kind === 'gR' ? '中' : '發'}
      </text>
    );
  }
  if (kind === 'gW') {
    return <rect x="14" y="20" width="32" height="44" rx="4" fill="none" stroke={BLUE} strokeWidth="3.5" />;
  }
  // flower
  return (
    <>
      <text x="30" y="52" fontSize="30" fontFamily={CJK_FONT} fill={PINK} textAnchor="middle">
        花
      </text>
      <text x="49" y="15" fontSize="11" fontWeight="700" fill={PINK} textAnchor="middle">
        {kind[1]}
      </text>
    </>
  );
}

export default function Tile({ kind, size = 'md', selected, highlight, onClick }: TileProps) {
  const cls = [
    'tile',
    `tile-${size}`,
    selected ? 'tile-selected' : '',
    highlight ? 'tile-highlight' : '',
    onClick ? 'tile-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const svg = (
    <svg viewBox="0 0 60 84" aria-hidden focusable="false">
      {kind ? (
        <>
          <rect x="1.5" y="1.5" width="57" height="81" rx="8" className="tile-body" />
          <Face kind={kind} />
        </>
      ) : (
        <>
          <rect x="1.5" y="1.5" width="57" height="81" rx="8" className="tile-backside" />
          <rect
            x="8"
            y="8"
            width="44"
            height="68"
            rx="5"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {svg}
      </button>
    );
  }
  return <div className={cls}>{svg}</div>;
}
