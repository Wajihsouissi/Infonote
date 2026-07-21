const fs = require('fs');

let content = fs.readFileSync('src/The-website/MarketingPage.tsx', 'utf8');

const imports = `import { SecondBrainIllustration } from './illustrations/SecondBrainIllustration';
import { ZettelkastenIllustration } from './illustrations/ZettelkastenIllustration';
import { MindmappingIllustration } from './illustrations/MindmappingIllustration';
import { AgileWorkflowsIllustration } from './illustrations/AgileWorkflowsIllustration';
import { NoteCard }`;

content = content.replace(/import \{ NoteCard \}/, imports);

content = content.replace(
  /title: "Second Brain",[\s\S]*?svg: \([\s\S]*?<\/svg>\n      \)/,
  `title: "Second Brain",
      desc: "Capture your thoughts, ideas, and knowledge in a centralized digital repository. Chunkit naturally accommodates the P.A.R.A method.",
      icon: <Database />,
      color: "#f97316",
      svg: <SecondBrainIllustration />`
);

content = content.replace(
  /title: "Zettelkasten",[\s\S]*?svg: \([\s\S]*?<\/svg>\n      \)/,
  `title: "Zettelkasten",
      desc: "Create atomic notes and interconnect them organically. Foster emergent ideas through bidirectional linking and spatial mapping.",
      icon: <Link2 />,
      color: "#e3a24f",
      svg: <ZettelkastenIllustration />`
);

content = content.replace(
  /title: "Mindmapping",[\s\S]*?svg: \([\s\S]*?<\/svg>\n      \)/,
  `title: "Mindmapping",
      desc: "Brainstorm visually on the infinite canvas. Group, connect, and hierarchize concepts without linear constraints.",
      icon: <Target />,
      color: "#ec4899",
      svg: <MindmappingIllustration />`
);

content = content.replace(
  /title: "Agile Workflows",[\s\S]*?svg: \([\s\S]*?<\/svg>\n      \)/,
  `title: "Agile Workflows",
      desc: "Turn insights into action. Extract tasks directly from your notes to build dynamic, fully-integrated Kanban boards.",
      icon: <Kanban />,
      color: "#f95d2e",
      svg: <AgileWorkflowsIllustration />`
);

fs.writeFileSync('src/The-website/MarketingPage.tsx', content);
console.log("Replacement complete!");
