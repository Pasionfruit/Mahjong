/**
 * Word Search's word bank — hand-curated, common, everyday words spanning
 * 4-8 letters (unlike Word Guess, a word search naturally wants varied
 * lengths, not a fixed 5). Grouped by length purely for my own review
 * sanity while writing this; `WORD_BANK` is what generation actually uses.
 * Validated by words.test.ts (length/format/uniqueness), same safety net
 * that caught real mistakes in Word Guess's list.
 */

const LEN4 = [
  'fish', 'bird', 'tree', 'moon', 'star', 'lake', 'wind', 'snow', 'rain', 'leaf',
  'rose', 'gold', 'ruby', 'jade', 'iron', 'sand', 'wave', 'reef', 'cave', 'hill',
  'park', 'road', 'gate', 'door', 'room', 'desk', 'lamp', 'book', 'card', 'game',
  'ball', 'drum', 'horn', 'ship', 'boat', 'frog', 'bear', 'wolf', 'deer', 'duck',
  'swan', 'crab', 'seal',
];

const LEN6 = [
  'flower', 'garden', 'forest', 'island', 'bridge', 'castle', 'planet', 'desert',
  'valley', 'canyon', 'spider', 'rabbit', 'turtle', 'monkey', 'parrot', 'beaver',
  'camera', 'pencil', 'rocket', 'engine', 'guitar', 'violin', 'window', 'garage',
  'tunnel', 'harbor', 'market', 'street', 'museum', 'jacket',
];

const LEN7 = [
  'glacier', 'dolphin', 'kitchen', 'balloon', 'rainbow', 'library', 'journey',
  'compass', 'diamond', 'chicken', 'lobster', 'penguin', 'blanket', 'picture',
  'crystal',
];

const LEN8 = [
  'elephant', 'dinosaur', 'mountain', 'sandwich', 'umbrella', 'keyboard',
  'kangaroo', 'crayfish', 'football', 'backpack', 'stairway',
];

export const WORD_BANK: string[] = [...LEN4, ...LEN6, ...LEN7, ...LEN8];
