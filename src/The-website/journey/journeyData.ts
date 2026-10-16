export const journeyChapters = [
  { id: 'begin', title: 'Big ideas\nstart small.', copy: 'Collect, connect, and shape your ideas. Let’s follow one.', act: 'A little space for your next big thing' },
  { id: 'collect', title: 'Give your idea\na feeling.', copy: 'A reference. A color. Something worth keeping.', act: 'Collect' },
  { id: 'connect', title: 'Move things.\nMake sense.', copy: 'Put your thoughts where the connections become clear.', act: 'Connect' },
  { id: 'compose', title: 'Bring it together.\nMake it yours.', copy: 'Your collected pieces become one living note.', act: 'Shape' },
  { id: 'card', title: 'One card.\nEverything inside.', copy: 'Give your idea a home. There’s more to it than meets the eye.', act: 'Contain' },
  { id: 'inside', title: 'A little closer.\nA lot more possible.', copy: 'Open a card. Discover a whole canvas inside.', act: 'Explore' },
  { id: 'perspective', title: 'Same idea.\nAnother perspective.', copy: 'Explore the structure. Change a thought. Keep it connected.', act: 'Connect your thinking' },
  { id: 'layers', title: 'Room for\nevery layer.', copy: 'Follow a thought further, without losing where you started.', act: 'Go deeper' },
  { id: 'angle', title: 'Find a\nnew angle.', copy: 'A little help to see what you haven’t considered.', act: 'Think deeper' },
  { id: 'action', title: 'Give it\na next step.', copy: 'That little idea? It’s going somewhere.', act: 'Make it happen' },
  { id: 'creators', title: 'Your next\npiece of content.', copy: 'Gather inspiration. Shape an outline. Make something worth sharing.', act: 'For content creators' },
  { id: 'students', title: 'Understand it.\nIn your own words.', copy: 'Keep sources close and connect what you’re learning.', act: 'For students' },
  { id: 'designers', title: 'Find your\ncreative direction.', copy: 'From a feeling to a moodboard to a visual brief.', act: 'For designers' },
  { id: 'builders', title: 'From what if\nto what’s next.', copy: 'A business idea, the research, and a plan to bring it to life.', act: 'For solo builders' },
  { id: 'para', title: 'A place for\nwhat matters now.', copy: 'PARA: organize projects, ongoing areas, resources, and past work.', act: 'Think your way · PARA' },
  { id: 'zettelkasten', title: 'Small notes.\nBigger ideas.', copy: 'Zettelkasten: write focused notes and connect related thoughts.', act: 'Think your way · Zettelkasten' },
  { id: 'cornell', title: 'Capture less.\nUnderstand more.', copy: 'Cornell Notes: questions, notes, and a summary in your own words.', act: 'Think your way · Cornell Notes' },
  { id: 'mindmap', title: 'See where\na thought leads.', copy: 'Mind Mapping: one idea, with room to branch out.', act: 'Think your way · Mind Mapping' },
  { id: 'start', title: 'What will your\nidea become?', copy: 'You don’t need the whole plan. Just a place to begin.', act: 'Your turn' },
] as const;

export type JourneyChapter = typeof journeyChapters[number];
export const LAST_CHAPTER = journeyChapters.length - 1;

// One persistent element follows these positions. Each chapter holds before
// transitioning; scrubbing backward evaluates the same path in reverse.
const desktop = [
  [50, 61, 340, 174], [58, 41, 285, 174], [23, 41, 285, 174],
  [68, 56, 380, 422], [50, 60, 320, 380], [68, 33, 340, 130],
  [32, 33, 340, 130], [68, 33, 340, 130], [32, 32, 320, 130],
  [68, 53, 200, 170], [32, 33, 320, 130], [68, 33, 320, 130],
  [32, 33, 320, 130], [68, 33, 320, 130], [32, 30, 320, 130],
  [68, 30, 320, 130], [32, 30, 320, 130], [68, 40, 300, 130],
  [50, 49, 340, 160],
];
const mobile = [
  [50, 56, 300, 150], [50, 44, 280, 130], [50, 44, 280, 130],
  [50, 63, 300, 365], [50, 62, 290, 348], [50, 42, 285, 112],
  [50, 42, 285, 112], [50, 42, 285, 112], [50, 42, 285, 112],
  [50, 59, 250, 145], [50, 42, 285, 112], [50, 42, 285, 112],
  [50, 42, 285, 112], [50, 42, 285, 112], [50, 40, 285, 112],
  [50, 40, 285, 112], [50, 40, 285, 112], [50, 42, 280, 112],
  [50, 49, 300, 150],
];

export function sampleTraveler(stage: number, compact: boolean, reduced: boolean) {
  const bounded = Math.max(0, Math.min(LAST_CHAPTER, stage));
  const from = Math.floor(bounded);
  const to = Math.min(from + 1, LAST_CHAPTER);
  const raw = Math.max(0, Math.min(1, (bounded - from - 0.25) / 0.65));
  const t = reduced ? (raw >= 0.5 ? 1 : 0) : raw * raw * (3 - 2 * raw);
  const frames = compact ? mobile : desktop;
  // The board arrives while the card is over Ideas, then the same element
  // travels into In progress. No duplicate/teleported card for the handoff.
  if (from === 8 && !reduced) {
    const midpoint = compact ? [50, 49, 250, 120] : [51, 53, 220, 170];
    const halfway = bounded - from;
    const a = halfway < 0.55 ? frames[8] : midpoint;
    const b = halfway < 0.55 ? midpoint : frames[9];
    const phase = halfway < 0.55 ? halfway / 0.55 : (halfway - 0.55) / 0.45;
    const eased = phase * phase * (3 - 2 * phase);
    return a.map((v, i) => v + (b[i] - v) * eased);
  }
  return frames[from].map((v, i) => v + (frames[to][i] - v) * t);
}

export function sceneOpacity(stage: number, index: number) {
  return Math.max(0, 1 - Math.abs(stage - index) * 2);
}
