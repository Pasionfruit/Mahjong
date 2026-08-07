/**
 * Word-of-the-day pool for Word Type. Everything is plain ASCII (straight
 * quotes, no dashes beyond hyphens) so every character is typeable on any
 * keyboard. Each story is exactly two sentences that use the word.
 */

export interface WordEntry {
  word: string;
  definition: string;
  story: string;
}

export const WORDS: WordEntry[] = [
  {
    word: 'serendipity',
    definition: 'Finding something good without looking for it.',
    story: 'Mara missed her train and wandered into a tiny bookshop. Buying the dusty atlas she found there was pure serendipity, since a map inside led to her new favorite hiking trail.',
  },
  {
    word: 'ephemeral',
    definition: 'Lasting for a very short time.',
    story: 'The frost drew ferns on the window before dawn. By breakfast the ephemeral garden had melted into plain wet glass.',
  },
  {
    word: 'luminous',
    definition: 'Full of or shedding light, glowing.',
    story: 'The plankton turned the midnight surf luminous. Every wave broke in a ribbon of cold green fire.',
  },
  {
    word: 'quixotic',
    definition: 'Idealistic in an impractical, dreamy way.',
    story: 'Uncle Ray announced a quixotic plan to sail a bathtub across the lake. He sank ten feet from the dock, grinning the whole way down.',
  },
  {
    word: 'petrichor',
    definition: 'The pleasant smell of rain on dry earth.',
    story: 'The first storm in months rolled over the farm. Petrichor drifted through the open windows, and the whole family stepped outside just to breathe.',
  },
  {
    word: 'wanderlust',
    definition: 'A strong desire to travel and roam.',
    story: 'The old postcards in the attic infected Nora with wanderlust. By spring she had traded her desk for a one-way ticket east.',
  },
  {
    word: 'mellifluous',
    definition: 'Sweetly smooth and musical to hear.',
    story: 'The radio host had a mellifluous voice that made traffic reports sound like lullabies. Half the city arrived at work late and perfectly calm.',
  },
  {
    word: 'tenacious',
    definition: 'Holding on firmly, refusing to give up.',
    story: 'The tenacious little vine returned no matter how often the fence was cleared. By August it owned the entire garden wall.',
  },
  {
    word: 'labyrinth',
    definition: 'A maze of complicated winding passages.',
    story: 'The used bookstore was a labyrinth of leaning shelves. Customers left breadcrumbs of receipts just to find the register again.',
  },
  {
    word: 'halcyon',
    definition: 'Calm, peaceful, and golden, as of a happy past.',
    story: 'Grandpa called them the halcyon summers, when the creek ran clear and nobody owned a watch. We mostly remember the mosquitoes.',
  },
  {
    word: 'resilient',
    definition: 'Able to recover quickly from difficulty.',
    story: 'The bakery burned down in March and reopened by June. A town that resilient never stays hungry for long.',
  },
  {
    word: 'sonder',
    definition: 'The realization that every stranger has a full, vivid life.',
    story: 'Stuck at the red light, Amir watched a hundred windows glow. A sudden rush of sonder made every silhouette a whole unread novel.',
  },
  {
    word: 'zephyr',
    definition: 'A soft, gentle breeze.',
    story: 'The kite hung dead in the July heat. Then a single zephyr slid off the hills and carried it over the water tower.',
  },
  {
    word: 'obsidian',
    definition: 'Dark volcanic glass formed from cooled lava.',
    story: 'The museum case held a blade of pure obsidian. Ten thousand years later, its edge still looked hungry.',
  },
  {
    word: 'gossamer',
    definition: 'Something extremely light, thin, and delicate.',
    story: 'Dawn hung gossamer threads between the fence posts. The spiders had rebuilt their whole city overnight.',
  },
  {
    word: 'ebullient',
    definition: 'Overflowing with cheerful energy.',
    story: 'The ebullient puppy greeted the mail carrier like a returning war hero. Nobody on the street got their letters unlicked.',
  },
  {
    word: 'meander',
    definition: 'To wander slowly along a winding course.',
    story: 'The river meanders through the valley like it lost its keys. Locals say it takes a day to travel a mile and a lifetime to leave.',
  },
  {
    word: 'incandescent',
    definition: 'Glowing white-hot, or brilliantly emotional.',
    story: 'The blacksmith drew the incandescent bar from the coals. For one breath the whole barn turned to daylight.',
  },
  {
    word: 'solitude',
    definition: 'The state of being alone, often peacefully.',
    story: 'The lighthouse keeper swore the solitude never bothered him. Still, he named all four hundred gulls.',
  },
  {
    word: 'cacophony',
    definition: 'A harsh, jarring mix of noises.',
    story: 'Band practice began as a cacophony of squeaks and honks. By December, the same kids played the winter concert perfectly.',
  },
  {
    word: 'verdant',
    definition: 'Lush and green with growing plants.',
    story: 'After the rains, the brown hills turned verdant overnight. The goats acted like they had inherited a kingdom.',
  },
  {
    word: 'nostalgia',
    definition: 'A bittersweet longing for the past.',
    story: 'The smell of chalk dust hit the old teacher with sudden nostalgia. Thirty years vanished, and she was a student again in the second row.',
  },
  {
    word: 'audacious',
    definition: 'Boldly daring, willing to take risks.',
    story: 'The audacious squirrel raided the bird feeder in front of three cats. It saluted them from the fence with a full mouth.',
  },
  {
    word: 'tranquil',
    definition: 'Free from disturbance, calm and still.',
    story: 'At five in the morning the harbor was perfectly tranquil. Even the buoy bells seemed to ring in a whisper.',
  },
  {
    word: 'kaleidoscope',
    definition: 'A shifting pattern of colors and shapes.',
    story: 'The autumn market was a kaleidoscope of pumpkins, quilts, and jam jars. Emma spent an hour and her whole allowance in the first row.',
  },
  {
    word: 'perseverance',
    definition: 'Continued effort despite difficulty.',
    story: 'It took Theo two hundred tries to land the skateboard trick. Perseverance, he said, is just falling with a schedule.',
  },
  {
    word: 'whimsical',
    definition: 'Playfully fanciful and unpredictable.',
    story: 'The architect added a whimsical slide beside the lobby stairs. Board meetings started ending suspiciously early.',
  },
  {
    word: 'equinox',
    definition: 'The day when daylight and night are equal.',
    story: 'On the equinox the farmers balance eggs on the fence rail. Nobody knows why, but nobody dares to stop.',
  },
  {
    word: 'benevolent',
    definition: 'Kind, generous, and well-meaning.',
    story: 'A benevolent stranger paid for every coffee until noon. The cafe spent the rest of the day paying it sideways and forward.',
  },
  {
    word: 'crescendo',
    definition: 'A gradual rise to a peak of intensity.',
    story: 'The crickets built their nightly crescendo as the sun fell. At full dark, the field roared like a tiny stadium.',
  },
  {
    word: 'archipelago',
    definition: 'A chain or cluster of islands.',
    story: 'The ferry threaded the archipelago all afternoon. Every island had one dock, one store, and one extremely important dog.',
  },
  {
    word: 'diligent',
    definition: 'Careful and persistent in work or effort.',
    story: 'The diligent librarian repaired every torn spine by hand. Books left her desk looking younger than their readers.',
  },
  {
    word: 'aurora',
    definition: 'Curtains of natural light in the polar sky.',
    story: 'They drove north until the radio gave up. Above the last gas station, the aurora unrolled in green silk.',
  },
  {
    word: 'ricochet',
    definition: 'To rebound off a surface after impact.',
    story: 'The skipping stone ricocheted seven times before sinking. The lake gave it a quiet round of ripples.',
  },
  {
    word: 'sanctuary',
    definition: 'A place of safety and refuge.',
    story: 'The treehouse was declared a sanctuary from homework and little brothers. Its ladder had a strict password that changed hourly.',
  },
  {
    word: 'lighthearted',
    definition: 'Cheerful, carefree, and untroubled.',
    story: 'The exam ended and the hallway turned instantly lighthearted. Someone cartwheeled past the trophy case and nobody minded.',
  },
  {
    word: 'voracious',
    definition: 'Having a huge, eager appetite.',
    story: 'Jo was a voracious reader who finished novels like sandwiches. The library capped her card at thirty books out of self-defense.',
  },
  {
    word: 'twilight',
    definition: 'The soft light after sunset or before sunrise.',
    story: 'At twilight the swifts stitched circles over the rooftops. The streetlights waited politely for them to finish.',
  },
  {
    word: 'catalyst',
    definition: 'Something that sparks change or action.',
    story: 'One broken vending machine was the catalyst for the office bake-off. Within a month there were brackets, trophies, and a scandal about store-bought muffins.',
  },
  {
    word: 'harbinger',
    definition: 'A sign that announces what is coming.',
    story: 'The first food truck of spring parked by the pier. Locals treat it as a harbinger more reliable than any forecast.',
  },
];
