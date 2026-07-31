/**
 * Hand-authored bank of 5×5 mini crosswords. The GRID is the source of
 * truth: every across and down reading was verified to be a real, common
 * English word before its clue was written, and intersections are
 * consistent by construction. Clue numbers follow standard crossword
 * numbering, which the engine re-derives from the grid shape — the
 * engine.test.ts bank validation asserts the numbers here match 1:1.
 *
 * Three shapes are used (all runs are 3–5 letters; no 2-letter words):
 *   staircase-left   ##··· / #···· / ····· / ····# / ···##
 *   staircase-right  ···## / ····# / ····· / #···· / ##···
 *   corner-cut       #···· / ····· / ····· / ····· / ····#
 */

export interface CrosswordClue {
  num: number;
  clue: string;
}

export interface CrosswordPuzzle {
  /** 5 strings of 5 chars: '#' = black square, 'A'–'Z' = solution letter. */
  grid: string[];
  cluesAcross: CrosswordClue[];
  cluesDown: CrosswordClue[];
}

export const PUZZLES: CrosswordPuzzle[] = [
  {
    // FUR / VERY / RANGE / ONCE / BEE — FENCE / URGE / RYE / VANE / ROB
    grid: ['##FUR', '#VERY', 'RANGE', 'ONCE#', 'BEE##'],
    cluesAcross: [
      { num: 1, clue: 'Coat on a cat' },
      { num: 4, clue: 'Extremely' },
      { num: 5, clue: 'Kitchen stove, or a cowboy’s home' },
      { num: 6, clue: 'A single time' },
      { num: 7, clue: 'Spelling contest' },
    ],
    cluesDown: [
      { num: 1, clue: 'Backyard boundary' },
      { num: 2, clue: 'Strong impulse' },
      { num: 3, clue: 'Deli bread choice' },
      { num: 4, clue: 'Weather pointer on a barn roof' },
      { num: 5, clue: 'Hold up, as a bank' },
    ],
  },
  {
    // PUT / RIPE / SALON / IRON / PET — PILOT / UPON / TEN / RARE / SIP
    grid: ['##PUT', '#RIPE', 'SALON', 'IRON#', 'PET##'],
    cluesAcross: [
      { num: 1, clue: 'Set down' },
      { num: 4, clue: 'Ready to eat, as a banana' },
      { num: 5, clue: 'Where to get a haircut' },
      { num: 6, clue: 'Wrinkle remover' },
      { num: 7, clue: 'Dog or cat, often' },
    ],
    cluesDown: [
      { num: 1, clue: 'Cockpit occupant' },
      { num: 2, clue: 'Once ___ a time' },
      { num: 3, clue: 'Perfect gymnastics score' },
      { num: 4, clue: 'Barely cooked, as a steak' },
      { num: 5, clue: 'Tiny taste of tea' },
    ],
  },
  {
    // RAY / RATE / PIVOT / ITEM / TEN — RAVEN / ATOM / YET / RITE / PIT
    grid: ['##RAY', '#RATE', 'PIVOT', 'ITEM#', 'TEN##'],
    cluesAcross: [
      { num: 1, clue: 'Beam of sunshine' },
      { num: 4, clue: 'Stars-out-of-five score' },
      { num: 5, clue: 'Basketball footwork, or a startup’s change of plan' },
      { num: 6, clue: 'To-do list entry' },
      { num: 7, clue: 'Number of bowling pins' },
    ],
    cluesDown: [
      { num: 1, clue: 'Poe’s “Nevermore” bird' },
      { num: 2, clue: 'Smallest bit of an element' },
      { num: 3, clue: 'So far' },
      { num: 4, clue: '___ of passage' },
      { num: 5, clue: 'Peach’s center' },
    ],
  },
  {
    // SEE / SWAY / THESE / ROPE / YET — SWEPT / EASE / EYE / SHOE / TRY
    grid: ['##SEE', '#SWAY', 'THESE', 'ROPE#', 'YET##'],
    cluesAcross: [
      { num: 1, clue: 'Perceive with the eyes' },
      { num: 4, clue: 'Move like palms in the wind' },
      { num: 5, clue: 'Not those, but ___' },
      { num: 6, clue: 'Tug-of-war need' },
      { num: 7, clue: 'Up to now' },
    ],
    cluesDown: [
      { num: 1, clue: 'Used a broom' },
      { num: 2, clue: 'Do it “with ___” and it looks effortless' },
      { num: 3, clue: 'A needle has one' },
      { num: 4, clue: 'Sneaker or loafer' },
      { num: 5, clue: 'Give it a shot' },
    ],
  },
  {
    // COD / CUBE / ARROW / COVE / EWE — CURVE / OBOE / DEW / CROW / ACE
    grid: ['##COD', '#CUBE', 'ARROW', 'COVE#', 'EWE##'],
    cluesAcross: [
      { num: 1, clue: 'Fish in fish and chips' },
      { num: 4, clue: 'Ice shape' },
      { num: 5, clue: 'Archer’s projectile' },
      { num: 6, clue: 'Sheltered bay' },
      { num: 7, clue: 'Female sheep' },
    ],
    cluesDown: [
      { num: 1, clue: 'Bend in the road' },
      { num: 2, clue: 'Reed instrument that tunes the orchestra' },
      { num: 3, clue: 'Morning droplets on grass' },
      { num: 4, clue: 'Bird that caws' },
      { num: 5, clue: 'Unbeatable tennis serve' },
    ],
  },
  {
    // HUG / NONE / PERIL / REST / ODE — HORSE / UNIT / GEL / NEED / PRO
    grid: ['##HUG', '#NONE', 'PERIL', 'REST#', 'ODE##'],
    cluesAcross: [
      { num: 1, clue: 'Warm embrace' },
      { num: 4, clue: 'Zilch' },
      { num: 5, clue: 'Grave danger' },
      { num: 6, clue: 'Take a breather' },
      { num: 7, clue: 'Poem of praise' },
    ],
    cluesDown: [
      { num: 1, clue: 'Trojan ___' },
      { num: 2, clue: 'Apartment, in real-estate listings' },
      { num: 3, clue: 'Hair goop' },
      { num: 4, clue: 'Require' },
      { num: 5, clue: 'Expert, informally' },
    ],
  },
  {
    // JAW / EXAM / TIGER / SOME / NOD — JET / AXIS / WAGON / MEMO / RED
    grid: ['JAW##', 'EXAM#', 'TIGER', '#SOME', '##NOD'],
    cluesAcross: [
      { num: 1, clue: 'It drops when you’re amazed' },
      { num: 4, clue: 'Final at the end of a semester' },
      { num: 6, clue: 'Striped big cat' },
      { num: 8, clue: 'A few' },
      { num: 9, clue: 'Silent yes' },
    ],
    cluesDown: [
      { num: 1, clue: 'Very fast plane' },
      { num: 2, clue: 'X or Y line on a graph' },
      { num: 3, clue: 'Little red pull-along' },
      { num: 5, clue: 'Office note' },
      { num: 7, clue: 'Stoplight color' },
    ],
  },
  {
    // NET / AXIS / PIANO / TRAP / APT — NAP / EXIT / TIARA / SNAP / OPT
    grid: ['NET##', 'AXIS#', 'PIANO', '#TRAP', '##APT'],
    cluesAcross: [
      { num: 1, clue: 'Tennis court divider' },
      { num: 4, clue: 'Earth spins on one' },
      { num: 6, clue: '88-key instrument' },
      { num: 8, clue: 'Mouse catcher' },
      { num: 9, clue: 'Fitting' },
    ],
    cluesDown: [
      { num: 1, clue: 'Afternoon snooze' },
      { num: 2, clue: 'Way out' },
      { num: 3, clue: 'Pageant crown' },
      { num: 5, clue: 'Finger click, or an easy task' },
      { num: 7, clue: 'Choose (to)' },
    ],
  },
  {
    // FIR / ATOM / REBEL / MINE / NUT — FAR / ITEM / ROBIN / MENU / LET
    grid: ['FIR##', 'ATOM#', 'REBEL', '#MINE', '##NUT'],
    cluesAcross: [
      { num: 1, clue: 'Christmas tree, often' },
      { num: 4, clue: 'Tiny building block of matter' },
      { num: 6, clue: 'Rule breaker' },
      { num: 8, clue: '“That one’s not yours, it’s ___!”' },
      { num: 9, clue: 'Cashew or almond' },
    ],
    cluesDown: [
      { num: 1, clue: 'A long way off' },
      { num: 2, clue: 'Shopping-list entry' },
      { num: 3, clue: 'Red-breasted herald of spring' },
      { num: 5, clue: 'Restaurant offering' },
      { num: 7, clue: 'Allow' },
    ],
  },
  {
    // COD / OMIT / BEGAN / NICE / TOW — COB / OMEN / DIGIT / TACO / NEW
    grid: ['COD##', 'OMIT#', 'BEGAN', '#NICE', '##TOW'],
    cluesAcross: [
      { num: 1, clue: 'Cape ___, Massachusetts' },
      { num: 4, clue: 'Leave out' },
      { num: 6, clue: 'Got started' },
      { num: 8, clue: 'Pleasant' },
      { num: 9, clue: 'Haul, as a broken-down car' },
    ],
    cluesDown: [
      { num: 1, clue: 'Corn holder' },
      { num: 2, clue: 'Sign of things to come' },
      { num: 3, clue: 'Finger, toe, or numeral' },
      { num: 5, clue: 'Folded Mexican fare' },
      { num: 7, clue: 'Fresh off the shelf' },
    ],
  },
  {
    // ZAP / ICON / PILOT / DATA / RED — ZIP / ACID / POLAR / NOTE / TAD
    grid: ['ZAP##', 'ICON#', 'PILOT', '#DATA', '##RED'],
    cluesAcross: [
      { num: 1, clue: 'Microwave, informally' },
      { num: 4, clue: 'Desktop clickable' },
      { num: 6, clue: 'TV show’s first episode' },
      { num: 8, clue: 'Spreadsheet fodder' },
      { num: 9, clue: 'Rose’s color, often' },
    ],
    cluesDown: [
      { num: 1, clue: 'Zero, in slang' },
      { num: 2, clue: 'Lemon juice, chemically' },
      { num: 3, clue: '___ bear' },
      { num: 5, clue: 'Post-it message' },
      { num: 7, clue: 'Wee bit' },
    ],
  },
  {
    // SEE / PALM / ARBOR / LOVE / WED — SPA / EARL / ELBOW / MOVE / RED
    grid: ['SEE##', 'PALM#', 'ARBOR', '#LOVE', '##WED'],
    cluesAcross: [
      { num: 1, clue: '“___ you later!”' },
      { num: 4, clue: 'Beach tree, or part of a hand' },
      { num: 6, clue: 'Ann ___, Michigan' },
      { num: 8, clue: 'Zero, in tennis' },
      { num: 9, clue: 'Tie the knot' },
    ],
    cluesDown: [
      { num: 1, clue: 'Massage venue' },
      { num: 2, clue: '___ Grey tea' },
      { num: 3, clue: 'Funny bone’s joint' },
      { num: 5, clue: 'Chess turn' },
      { num: 7, clue: 'Fire-engine color' },
    ],
  },
  {
    // PAST / SINCE / WAGON / INEPT / MOLE — PIANO / ANGEL / SCOPE / TENT / SWIM
    grid: ['#PAST', 'SINCE', 'WAGON', 'INEPT', 'MOLE#'],
    cluesAcross: [
      { num: 1, clue: 'History, collectively' },
      { num: 5, clue: 'From then until now' },
      { num: 6, clue: 'Covered ___ (pioneer’s ride)' },
      { num: 7, clue: 'Hopelessly clumsy' },
      { num: 8, clue: 'Backyard burrower' },
    ],
    cluesDown: [
      { num: 1, clue: 'Grand instrument' },
      { num: 2, clue: 'Halo wearer' },
      { num: 3, clue: 'Rifle attachment, or a project’s extent' },
      { num: 4, clue: 'Camper’s shelter' },
      { num: 5, clue: 'Do laps in a pool' },
    ],
  },
  {
    // MEET / HELLO / UDDER / NIECE / TART — MEDIA / ELDER / ELECT / TORE / HUNT
    grid: ['#MEET', 'HELLO', 'UDDER', 'NIECE', 'TART#'],
    cluesAcross: [
      { num: 1, clue: 'Track-and-field event' },
      { num: 5, clue: 'Adele hit, or a greeting' },
      { num: 6, clue: 'Milk source on a cow' },
      { num: 7, clue: 'Sibling’s daughter' },
      { num: 8, clue: 'Sharp-tasting, like some apples' },
    ],
    cluesDown: [
      { num: 1, clue: 'The press, collectively' },
      { num: 2, clue: 'Senior member' },
      { num: 3, clue: 'Choose by ballot' },
      { num: 4, clue: 'Ripped' },
      { num: 5, clue: 'Search (for)' },
    ],
  },
  {
    // SOAP / WHALE / EASEL / SKIRT / TEST — SHAKE / OASIS / ALERT / PELT / WEST
    grid: ['#SOAP', 'WHALE', 'EASEL', 'SKIRT', 'TEST#'],
    cluesAcross: [
      { num: 1, clue: 'Suds maker' },
      { num: 5, clue: 'Largest animal on Earth (blue one)' },
      { num: 6, clue: 'Painter’s stand' },
      { num: 7, clue: 'Garment, or to dodge (an issue)' },
      { num: 8, clue: 'Pop quiz, e.g.' },
    ],
    cluesDown: [
      { num: 1, clue: 'Milkshake, minus the milk?' },
      { num: 2, clue: 'Desert watering hole' },
      { num: 3, clue: 'Phone buzz, e.g.' },
      { num: 4, clue: 'Animal hide' },
      { num: 5, clue: 'Sunset direction' },
    ],
  },
  {
    // STIR / SHONE / TAKEN / ALERT / BENT — SHALE / TOKEN / INERT / RENT / STAB
    grid: ['#STIR', 'SHONE', 'TAKEN', 'ALERT', 'BENT#'],
    cluesAcross: [
      { num: 1, clue: 'Mix with a spoon' },
      { num: 5, clue: 'Gleamed' },
      { num: 6, clue: 'Spoken for' },
      { num: 7, clue: 'Wide-awake' },
      { num: 8, clue: 'Not straight' },
    ],
    cluesDown: [
      { num: 1, clue: 'Layered sedimentary rock' },
      { num: 2, clue: 'Arcade coin' },
      { num: 3, clue: 'Like helium, chemically' },
      { num: 4, clue: 'Monthly payment to a landlord' },
      { num: 5, clue: 'Take a ___ at (attempt)' },
    ],
  },
];
