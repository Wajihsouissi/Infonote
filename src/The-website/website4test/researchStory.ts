/** The single research fixture behind the whole page.
 *
 * Every string here is demo content written for this story: nothing is read
 * from, or written to, a real workspace. IDs stay stable across scenes so a
 * piece is still recognizable when it turns up in the outline or on the board. */

export const PROJECT_TITLE = 'A calmer workspace';
export const GROUP_TITLE = 'Workspace experiment';

export interface Chunk {
  id: 'C1' | 'C2' | 'C3';
  /** The sentence the block is known by once it travels on its own. */
  lead: string;
  rest: string;
}

/* The three paragraphs of S1. A chunk is its paragraph, word for word. */
export const C1: Chunk = { id: 'C1', lead: 'Keep tools within reach.', rest: 'If the notebook is across the room, I stall before I begin.' };
export const C2: Chunk = { id: 'C2', lead: 'Leave space for the current task.', rest: 'Yesterday’s project stays in view and keeps pulling at me.' };
export const C3: Chunk = { id: 'C3', lead: 'Reset the desk the night before.', rest: 'On the mornings I start quickly, it was already clear.' };
export const chunks = [C1, C2, C3] as const;

export const sources = {
  note: { id: 'S1', title: 'Desk observations' },
  photo: {
    id: 'S2',
    title: 'Desk reference',
    alt: 'A desk seen from above: a laptop, an open notebook, a mug and a plant.',
  },
  file: { id: 'S3', title: 'Research questions', meta: 'Text file' },
} as const;

export const question = { id: 'Q1', lead: 'What actually helps me start?' } as const;

/** A comment the person writes beside the connection. Never a generated insight. */
export const angle = 'A possible angle: remove friction before adding tools.';

export const outline = {
  id: 'O1',
  title: 'Video outline',
  parts: [
    { name: 'Friction', line: 'Where starting gets hard', refs: ['C1', 'C2'] },
    { name: 'Experiment', line: 'One week of resetting the desk', refs: ['C3'] },
    { name: 'Reflection', line: 'What actually helped me start', refs: ['Q1'] },
  ],
} as const;

export const tasks = [
  { id: 'T1', title: 'Draft opening' },
  { id: 'T2', title: 'Capture desk footage' },
  { id: 'T3', title: 'Edit first cut' },
] as const;

/* Lane names match the board's own defaults (kanbanTypes.ts). */
export const lanes = ['To Do', 'In Progress', 'Done'] as const;

export const assist = {
  prompt: 'Suggest three questions to develop this idea.',
  answers: [
    'What would count as a quick start, and how would you notice it?',
    'Which evening is hardest to reset, and why?',
    'What stays on the desk no matter what?',
  ],
  disclaimer: 'Example AI response · Sign-in required',
} as const;

export const chapters = [
  { id: 'collection', number: '01', name: 'The collection' },
  { id: 'cut', number: '02', name: 'The cut' },
  { id: 'connection', number: '03', name: 'The connection' },
  { id: 'depth', number: '04', name: 'The depth' },
  { id: 'assist', number: '05', name: 'The thinking partner' },
  { id: 'plan', number: '06', name: 'The plan' },
  { id: 'your-turn', number: '07', name: 'Your turn' },
  { id: 'ownership', number: '08', name: 'The ownership' },
] as const;

export type ChapterId = typeof chapters[number]['id'];

export interface ChapterCopy {
  title: string;
  body: string;
  /** What the product actually does here, as short noun phrases. */
  proof: readonly string[];
  /** Visible line under the demonstration. */
  caption: string;
  /** The same demonstration, described for someone who cannot see it. */
  alt: string;
  footnote?: string;
}

export const story: Record<'cut' | 'connection' | 'depth' | 'assist' | 'plan', ChapterCopy> = {
  cut: {
    title: 'Give each idea room to think.',
    body: 'Split a long note into blocks you can move. The words stay exactly as you wrote them.',
    proof: ['Block editor', 'Split and fuse', 'Free arrangement'],
    caption: 'One note becomes three blocks. Same text, now movable.',
    alt: 'A note titled Desk observations is selected and split into three separate blocks. The text of each block is unchanged.',
  },
  connection: {
    title: 'See what belongs together.',
    body: 'Move two ideas side by side and draw the line yourself. Keep the photo or file that prompted them close by.',
    proof: ['Infinite canvas', 'Connections you draw', 'References nearby'],
    caption: 'You place the cards and draw the connection. The note beside it is yours too.',
    alt: 'Two idea blocks move closer and a line is drawn between them. A question block joins below, and a short handwritten angle sits beside the connection. A reference photo stays nearby.',
  },
  depth: {
    title: 'Go deeper. Keep the bigger picture.',
    body: 'Open a card to find a canvas inside it. Work on the detail, then step back out to where you were.',
    proof: ['Nested canvases', 'Writing in context'],
    caption: 'Inside the card: the same ideas, written up as an observation, a question and a next experiment.',
    alt: 'Four blocks are grouped into a card titled Workspace experiment. The card opens into its own canvas, with a breadcrumb back to A calmer workspace and a structured note inside.',
    footnote: 'Nesting depth is limited until you sign in.',
  },
  assist: {
    title: 'Find a useful next question.',
    body: 'Select a note and ask for help thinking it through. Keep what is useful and leave the rest.',
    proof: ['AI text assistance', 'Optional'],
    caption: 'An illustrative response. AI assistance needs a signed-in account.',
    alt: 'A selected block, Reset the desk the night before, with an assistant panel beside it. The request is: Suggest three questions to develop this idea. Three example questions are listed.',
  },
  plan: {
    title: 'Turn your thinking into a next step.',
    body: 'Write the outline from the ideas you connected, add tasks, and move them across a board as the work begins.',
    proof: ['Writing', 'Kanban board'],
    caption: 'The outline and the tasks are written by hand. One task moves to In Progress.',
    alt: 'The research blocks sit beside a video outline with three parts: friction, experiment and reflection. On a board with three lanes, the task Draft opening moves from To Do to In Progress.',
  },
};

/* Answers follow BETA_SCOPE.md. Re-check them against the build that ships. */
export const faq = [
  {
    q: 'Can I start without an account?',
    a: 'Yes. The canvas, cards, connections and the block editor work without signing in. AI assistance and cloud sync need an account.',
  },
  {
    q: 'Where is my work saved?',
    a: 'In this browser by default. If you sign in and choose This device + cloud, a cloud copy is kept as well. Browser-only work does not follow you to other devices, and it can be lost if browser data is cleared.',
  },
  {
    q: 'Can I use my existing research?',
    a: 'You can paste text into notes and add files to the canvas, then keep them next to your ideas. There is no automatic import from Notion or Word.',
  },
  {
    q: 'Do I have to use AI?',
    a: 'No. Writing, arranging and connecting are the core of Chunked. AI text assistance is optional.',
  },
] as const;
