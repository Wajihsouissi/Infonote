import { ArrowRight, Check, ChevronRight, CornerDownRight, FileText, Lightbulb, Pencil, Sparkles } from 'lucide-react';
import { StoryNode, CoffeeGallery, ResearchFile, ReferenceLink, TaskLine, Connector } from './JourneyPrimitives';
import styles from './JourneyPage.module.css';

export function CollectionScene({ connected = false }: { connected?: boolean }) {
  return <div className={styles.collection}>
    <div className={styles.collectedGallery}><StoryNode><CoffeeGallery /><div className={styles.palette}><i /><i /><i /><span>A welcoming feeling</span></div></StoryNode></div>
    <div className={styles.collectedNote}><StoryNode label="My observation">Make it easy to show up on your own.</StoryNode></div>
    <div className={styles.collectedFile}><ResearchFile /></div>
    <div className={styles.collectedLink}><StoryNode><ReferenceLink /></StoryNode></div>
    {connected && <svg className={styles.collectionLine} viewBox="0 0 600 500" aria-hidden="true"><path d="M130 105C130 280 70 180 80 285" /></svg>}
  </div>;
}

export function MapScene({ edited = false, deeper = false }: { edited?: boolean; deeper?: boolean }) {
  return <div className={styles.mapScene}>
    <div className={styles.breadcrumb}>My canvas <ChevronRight size={13} /> Business idea {deeper && <><ChevronRight size={13} /> Launch content</>}</div>
    <Connector />
    <div className={styles.branches}>
      <div><StoryNode label={deeper ? 'Launch content' : 'The experience'}>{deeper ? 'Tell the neighborhood.' : 'A coffee. A conversation.'}</StoryNode><StoryNode>{deeper ? 'An invitation that feels like you.' : 'Make it easy to show up alone.'}</StoryNode></div>
      <div><StoryNode label={deeper ? 'The announcement' : 'The first pop-up'}><TaskLine edited={edited} /></StoryNode><StoryNode><ReferenceLink /></StoryNode></div>
    </div>
    {edited ? <div className={styles.parentProof}><span><Check size={14} /> Back in the parent note</span><TaskLine edited /></div> : <div className={styles.mapProof}>{deeper ? <><CornerDownRight size={14} /> One idea. A canvas for every layer.</> : <><Pencil size={14} /> Your written content, opened as a connected structure.</>}</div>}
  </div>;
}

export function AIScene() {
  return <div className={styles.aiScene}><div className={styles.question}>What am I missing?</div><StoryNode className={styles.aiAnswer}><div className={styles.aiLabel}><Sparkles size={15} /> A new angle</div><h3>What would make people come back?</h3><p>Ask five neighbors what they would want from a coffee club.</p></StoryNode><small>Illustrative AI response · Sign-in required</small></div>;
}

export function BoardScene() {
  return <div className={styles.board}>{['Ideas', 'In progress', 'Ready'].map((label, i) => <div className={styles.lane} key={label}><div className={styles.laneTitle}><i data-active={i === 1} />{label}</div>{i === 1 && <span className={styles.boardCaption}>A little thought, now in motion.</span>}</div>)}</div>;
}

const audiences = [
  [['References', 'A gallery of inspiration'], ['Video outline', 'Hook. Story. Invitation.'], ['Publishing board', 'Your next piece, taking shape.']],
  [['Source PDF', 'Keep the original nearby'], ['Own-word notes', 'Explain it to yourself'], ['Revision map', 'Connect the bigger picture']],
  [['Moodboard', 'A visual feeling'], ['Color direction', 'Cream, forest, coffee'], ['Visual brief', 'One coherent direction']],
  [['Business idea', 'A neighborhood coffee club'], ['Research', 'What the neighbors need'], ['Launch plan', 'A Saturday pop-up']],
];
export function AudienceScene({ index }: { index: number }) {
  return <div className={styles.audienceScene}>
    {index === 2 && <CoffeeGallery compact />}
    <div className={styles.flow}>{audiences[index].map(([title, detail], i) => <div className={styles.flowStep} key={title}><StoryNode label={title}>{detail}</StoryNode>{i < 2 && <ArrowRight size={17} className={styles.flowArrow} />}</div>)}</div>
    <p className={styles.contextLine}>One canvas. Your own way to create.</p>
  </div>;
}

export function MethodScene({ method }: { method: 'para' | 'zettelkasten' | 'cornell' | 'mindmap' }) {
  return <div className={styles.methodScene}>
    {method === 'para' && <div className={styles.para}>{[['Projects', 'First coffee pop-up'], ['Areas', 'Community relationships'], ['Resources', 'Coffee references'], ['Archives', 'Past experiments']].map(([title, content]) => <StoryNode card label={title} key={title}>{content}</StoryNode>)}</div>}
    {method === 'zettelkasten' && <div className={styles.zettel}>{['Shared rituals build familiarity.', 'Small gatherings make joining easier.', 'A recurring neighborhood coffee club.'].map((text, i) => <StoryNode key={text} label={i === 2 ? 'A connected idea' : `Note ${i + 1}`}>{text}{i === 0 && <small><FileText size={12} /> Your words + a source</small>}</StoryNode>)}</div>}
    {method === 'cornell' && <div className={styles.cornell}><StoryNode label="Questions / cues">Why would people return?</StoryNode><StoryNode label="Notes">A familiar place. A regular time. A chance to meet the same people.</StoryNode><StoryNode label="Summary">Make the coffee club easy to join, and easy to repeat.</StoryNode></div>}
    {method === 'mindmap' && <div className={styles.mindmap}><Connector radial />{[['Audience', 'Neighbors. Solo visitors.'], ['Experience', 'Welcoming. Familiar.'], ['First event', 'Place. Time. Invitation.']].map(([title, content]) => <StoryNode label={title} key={title}>{content}</StoryNode>)}</div>}
    <p className={styles.methodNote}><Lightbulb size={14} /> {method === 'para' ? 'Create four parent cards. Place notes by their current purpose.' : method === 'zettelkasten' ? 'Write one focused idea per card. Connect related notes.' : method === 'cornell' ? 'Arrange cues, notes, and a summary. Use cues to practice recall.' : 'Place one idea centrally. Connect related cards around it.'}</p>
  </div>;
}

export function SceneContent({ index }: { index: number }) {
  if (index === 1 || index === 2) return <CollectionScene connected={index === 2} />;
  if (index >= 5 && index <= 7) return <MapScene edited={index === 6} deeper={index === 7} />;
  if (index === 8) return <AIScene />;
  if (index === 9) return <BoardScene />;
  if (index >= 10 && index <= 13) return <AudienceScene index={index - 10} />;
  if (index >= 14 && index <= 17) return <MethodScene method={(['para', 'zettelkasten', 'cornell', 'mindmap'] as const)[index - 14]} />;
  return null;
}
