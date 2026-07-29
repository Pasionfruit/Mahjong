/**
 * Word Guess's word lists. ANSWER_WORDS is the curated pool used to pick
 * endless-mode answers and to seed the wordle_answers table's dated rows
 * (see the SQL bundle) — common, unambiguous, non-offensive words only.
 * VALID_GUESSES is the broader set accepted as a guess (superset of
 * ANSWER_WORDS). Both are hand-curated for MVP — smaller than a real
 * ~13,000-word Wordle dictionary by design; see the design doc's content-
 * work risk callout. Widening it later is just appending to these arrays.
 */

export const ANSWER_WORDS: string[] = [
  'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again',
  'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone',
  'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena',
  'argue', 'arise', 'armor', 'aside', 'asset', 'avoid', 'awake', 'award', 'aware', 'badly',
  'baker', 'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench',
  'birth', 'black', 'blade', 'blame', 'blank', 'blast', 'blend', 'bless', 'blind', 'block',
  'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'brave', 'bread', 'break',
  'breed', 'brick', 'brief', 'bring', 'broad', 'broke', 'brown', 'brush', 'build', 'built',
  'burst', 'buyer', 'cabin', 'cable', 'candy', 'canal', 'candy', 'carry', 'catch', 'cause',
  'chain', 'chair', 'chalk', 'champ', 'chaos', 'charm', 'chart', 'chase', 'cheap', 'check',
  'cheer', 'chess', 'chest', 'chief', 'child', 'chill', 'choir', 'chose', 'civic', 'civil',
  'claim', 'class', 'clean', 'clear', 'clerk', 'click', 'cliff', 'climb', 'cling', 'clock',
  'close', 'cloth', 'cloud', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft',
  'crane', 'crash', 'crawl', 'crazy', 'cream', 'creek', 'crest', 'crime', 'crisp', 'cross',
  'crowd', 'crown', 'crude', 'cruel', 'crush', 'curve', 'cycle', 'daily', 'dairy', 'dance',
  'dealt', 'death', 'debut', 'delay', 'depth', 'derby', 'diary', 'digit', 'diner', 'dirty',
  'dodge', 'doubt', 'dozen', 'draft', 'drain', 'drama', 'drawn', 'dream', 'dress', 'dried',
  'drift', 'drink', 'drive', 'drove', 'drums', 'dusty', 'eager', 'early', 'earth', 'eight',
  'elbow', 'elder', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error',
  'essay', 'event', 'every', 'exact', 'exist', 'extra', 'fable', 'faint', 'fairy', 'faith',
  'false', 'fault', 'fence', 'fever', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final',
  'first', 'fixed', 'flame', 'flash', 'fleet', 'flesh', 'flies', 'float', 'flock', 'flood',
  'floor', 'flour', 'fluid', 'focus', 'force', 'forge', 'forth', 'forty', 'forum', 'found',
  'frame', 'fraud', 'fresh', 'front', 'frost', 'fruit', 'fully', 'funny', 'gauge', 'ghost',
  'giant', 'given', 'glass', 'globe', 'glory', 'glove', 'going', 'grace', 'grade', 'grain',
  'grand', 'grant', 'grape', 'graph', 'grasp', 'grass', 'grave', 'great', 'green', 'greet',
  'grief', 'grill', 'grind', 'groom', 'group', 'grove', 'grown', 'guard', 'guess', 'guest',
  'guide', 'habit', 'happy', 'harsh', 'heart', 'heavy', 'hello', 'house', 'human', 'humor',
  'hurry', 'ideal', 'image', 'index', 'inner', 'input', 'issue', 'ivory', 'joint', 'judge',
  'juice', 'jumbo', 'knife', 'knock', 'known', 'label', 'labor', 'large', 'laser', 'later',
  'laugh', 'layer', 'learn', 'least', 'leave', 'legal', 'lemon', 'level', 'light', 'limit',
  'linen', 'lobby', 'local', 'lodge', 'logic', 'loose', 'lower', 'loyal', 'lucky', 'lunar',
  'lunch', 'lying', 'magic', 'major', 'maker', 'march', 'match', 'maybe', 'mayor', 'medal',
  'media', 'metal', 'meter', 'might', 'minor', 'minus', 'mixed', 'model', 'money', 'month',
  'moral', 'motor', 'mount', 'mouse', 'mouth', 'movie', 'music', 'naive', 'naked', 'nerve',
  'never', 'newly', 'night', 'noble', 'noise', 'north', 'noted', 'novel', 'nurse', 'ocean',
  'offer', 'often', 'olive', 'onion', 'opera', 'orbit', 'order', 'organ', 'other', 'ought',
  'outer', 'owner', 'oxide', 'paint', 'panel', 'panic', 'paper', 'party', 'pasta', 'patch',
  'pause', 'peace', 'penny', 'phase', 'phone', 'photo', 'piano', 'piece', 'pilot', 'pitch',
  'pizza', 'place', 'plain', 'plane', 'plant', 'plate', 'plaza', 'plead', 'point', 'pound', 'power',
  'press', 'price', 'pride', 'prime', 'print', 'prior', 'prize', 'proof', 'proud', 'prove',
  'pulse', 'pupil', 'puppy', 'purse', 'queen', 'query', 'quick', 'quiet', 'quilt', 'quite',
  'quote', 'radio', 'raise', 'rally', 'ranch', 'range', 'rapid', 'ratio', 'reach', 'ready',
  'realm', 'rebel', 'refer', 'reign', 'relax', 'relay', 'reply', 'right', 'rigid', 'rival',
  'river', 'roast', 'robin', 'robot', 'rocky', 'rough', 'round', 'route', 'royal', 'rural',
  'salad', 'salon', 'sauce', 'scale', 'scare', 'scarf', 'scene', 'scent', 'scope', 'score',
  'scout', 'scrap', 'screw', 'seats', 'seven', 'shade', 'shake', 'shall', 'shame', 'shape',
  'share', 'shark', 'sharp', 'sheep', 'sheet', 'shelf', 'shell', 'shift', 'shine', 'shiny',
  'shirt', 'shock', 'shoot', 'shore', 'short', 'shown', 'sight', 'silly', 'since', 'sixty',
  'sized', 'skill', 'sleep', 'slice', 'slide', 'small', 'smart', 'smell', 'smile', 'smoke',
  'snake', 'sneak', 'snowy', 'solar', 'solid', 'solve', 'sorry', 'sound', 'south', 'space',
  'spare', 'spark', 'speak', 'speed', 'spell', 'spend', 'spent', 'spice', 'spike', 'spine',
  'split', 'spoil', 'spoke', 'sport', 'spray', 'squad', 'stack', 'staff', 'stage', 'stair',
  'stake', 'stall', 'stamp', 'stand', 'stark', 'start', 'state', 'steak', 'steal', 'steam',
  'steel', 'steep', 'steer', 'stern', 'stick', 'stiff', 'still', 'sting', 'stock', 'stone',
  'stood', 'stool', 'store', 'storm', 'story', 'stove', 'strap', 'straw', 'stray', 'strip',
  'study', 'stuff', 'style', 'sugar', 'suite', 'sunny', 'super', 'surge', 'swamp', 'swaps',
  'swear', 'sweat', 'sweet', 'swept', 'swift', 'swing', 'sword', 'table', 'taken', 'taste',
  'teach', 'tease', 'tempo', 'tenth', 'thank', 'theft', 'their', 'theme', 'there', 'these',
  'thick', 'thief', 'thing', 'think', 'third', 'those', 'three', 'threw', 'throw', 'thumb',
  'tidal', 'tiger', 'tight', 'timer', 'tired', 'title', 'toast', 'today', 'token', 'topic',
  'torch', 'total', 'touch', 'tough', 'tower', 'trace', 'track', 'trade', 'trail', 'train',
  'trait', 'trash', 'treat', 'trend', 'trial', 'tribe', 'trick', 'tried', 'troop', 'truck',
  'truly', 'trunk', 'trust', 'truth', 'twice', 'twist', 'under', 'union', 'unity', 'until',
  'upper', 'upset', 'urban', 'usage', 'usual', 'vague', 'valid', 'value', 'vapor', 'vault',
  'venue', 'video', 'vinyl', 'viral', 'virus', 'visit', 'vital', 'vivid', 'vocal', 'voice',
  'waste', 'watch', 'water', 'weigh', 'weird', 'wheel', 'where', 'which', 'while', 'white',
  'whole', 'whose', 'woman', 'women', 'world', 'worry', 'worse', 'worst', 'worth', 'would',
  'wound', 'wrist', 'write', 'wrong', 'wrote', 'yield', 'young', 'youth',
];

/** Extra accepted guesses beyond the answer pool — real words, less common
 *  as puzzle answers but shouldn't be rejected when typed. */
const EXTRA_GUESSES: string[] = [
  'aback', 'abbey', 'abide', 'acids', 'acorn', 'adage', 'adieu', 'affix', 'afoot', 'aider',
  'algae', 'alloy', 'alpha', 'amber', 'amend', 'amity', 'ample', 'amuse', 'aorta', 'apron',
  'aptly', 'arbor', 'ardor', 'armed', 'aroma', 'array', 'arrow', 'atlas', 'atoll', 'attic',
  'audio', 'audit', 'avert', 'axiom', 'axion', 'bacon', 'badge', 'bagel', 'balmy', 'banjo',
  'barge', 'baron', 'basil', 'batch', 'baton', 'bayou', 'beady', 'beast', 'beefy', 'befit',
  'belly', 'berth', 'beset', 'bevel', 'bicep', 'biome', 'bison', 'blaze', 'bleak', 'blimp',
  'bliss', 'bloat', 'blond', 'bluff', 'blunt', 'blurb', 'blurt', 'boast', 'bogus', 'bolts',
  'bonus', 'booty', 'borax', 'bossy', 'bowel', 'boxer', 'brace', 'braid', 'brawn', 'brine',
  'briny', 'brisk', 'broil', 'broth', 'bugle', 'bulky', 'bunny', 'burly', 'cache', 'cacti',
  'camel', 'canoe', 'caper', 'cargo', 'carol', 'carve', 'caste', 'cedar', 'cello',
  'chard', 'charm', 'chasm', 'cheek', 'cheer', 'cheat', 'chess', 'chewy', 'chirp', 'choke',
  'chomp', 'chord', 'chunk', 'churn', 'cider', 'cigar', 'cinch', 'circa', 'civic', 'clamp',
  'clang', 'clash', 'clasp', 'cleft', 'clone', 'cobra', 'cocoa', 'colon', 'comet', 'comic',
  'comma', 'condo', 'conic', 'coral', 'corny', 'couch', 'cough', 'creek', 'creme',
  'crepe', 'crick', 'crimp', 'crisp', 'croak', 'crony', 'crook', 'croon', 'crypt',
  'cubic', 'cumin', 'curly', 'curry', 'curse', 'curvy', 'cyber', 'daddy', 'daisy', 'decal',
  'decor', 'decoy', 'delta', 'demon', 'dense', 'depot', 'devil',
  'digit', 'dimly', 'diner', 'dingo', 'disco', 'ditch', 'ditty', 'diver', 'dizzy', 'donor',
  'donut', 'doubt', 'dowel', 'downy', 'dozen', 'drape', 'drier', 'droop', 'droll', 'drown',
  'dryer', 'dusky', 'dwarf', 'dwell', 'eagle', 'ebony', 'eerie', 'egret', 'eject',
  'elbow', 'elope', 'elude', 'emote', 'emcee', 'enact', 'endow', 'envoy', 'epoch', 'epoxy',
  'evoke', 'exalt', 'exile', 'expel', 'extol', 'fable', 'facet', 'faded', 'fairy',
];

function normalize(list: string[]): string[] {
  return Array.from(new Set(list.map((w) => w.trim().toLowerCase()))).filter((w) => /^[a-z]{5}$/.test(w));
}

export const NORMALIZED_ANSWER_WORDS: string[] = normalize(ANSWER_WORDS);
export const VALID_GUESSES: Set<string> = new Set([...NORMALIZED_ANSWER_WORDS, ...normalize(EXTRA_GUESSES)]);

export function isValidGuess(word: string): boolean {
  return VALID_GUESSES.has(word.trim().toLowerCase());
}

export function pickAnswer(rand: () => number): string {
  const idx = Math.floor(rand() * NORMALIZED_ANSWER_WORDS.length);
  return NORMALIZED_ANSWER_WORDS[idx]!;
}
