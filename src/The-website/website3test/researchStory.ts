export const chapters = [
  { id: 'collection', label: 'Collect' },
  { id: 'cut', label: 'Break it down' },
  { id: 'connect', label: 'Connect' },
  { id: 'depth', label: 'Go deeper' },
  { id: 'assist', label: 'Find an angle' },
  { id: 'plan', label: 'Make a plan' },
  { id: 'explore', label: 'Try it' },
  { id: 'storage', label: 'Make it yours' },
] as const;

export const ideas = [
  { id: 'tools', title: 'Keep tools within reach', body: 'The things I use every day deserve a place close by.', source: 'Desk observations', color: 'paper' },
  { id: 'space', title: 'Leave space for the current task', body: 'One open notebook. One thing to work on. A little room to begin.', source: 'Desk observations', color: 'pink' },
  { id: 'question', title: 'What actually helps me start?', body: 'A question worth exploring before buying another desk accessory.', source: 'Research questions', color: 'green' },
] as const;

export const faqs = [
  { question: 'What is Chunked, exactly?', answer: 'A visual workspace for research, notes, and project planning. Write in blocks, move ideas around a canvas, connect related thoughts, and keep the details inside nested cards.' },
  { question: 'Can I start without an account?', answer: 'Yes. You can explore the core canvas without an account. Choose your storage mode when you start. Cloud sync and AI assistance require sign-in.' },
  { question: 'Can I bring my existing research?', answer: 'You can add your notes and files to your workspace. Keep a source beside your own thinking. Direct Notion and Word workspace imports are not currently part of the beta.' },
  { question: 'Where is my work saved?', answer: 'Choose this device, or this device plus cloud sync. Browser-only work stays in this browser and can be lost if its data is cleared. Sign in and choose cloud sync to keep a cloud copy.' },
  { question: 'Do I have to use AI?', answer: 'No. Writing, arranging, connecting, and planning work without AI. AI text assistance is there when you want help exploring a question.' },
];
