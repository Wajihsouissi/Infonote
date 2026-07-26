import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Layers, Workflow, HardDrive, Share2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import styles from './MarketingPage.module.css';

export const FeaturesPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={styles.pageContainer} style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-main)', overflowX: 'hidden' }}>
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 24px;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px 120px;
        }
        .col-span-12 { grid-column: span 12; }
        .col-span-8 { grid-column: span 8; }
        .col-span-4 { grid-column: span 4; }
        .col-span-6 { grid-column: span 6; }
        
        .bento-card {
          background: var(--bg-card);
          border: 1px solid var(--line-strong);
          border-radius: 24px;
          padding: 40px;
          position: relative;
          overflow: hidden;
          min-height: 380px;
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 900px) {
          .col-span-8, .col-span-4, .col-span-6 { grid-column: span 12; }
          .bento-card { min-height: 300px; }
        }
      `}</style>

      {/* Top Nav */}
      <nav style={{ padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          onClick={() => setCurrentView('marketing')}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: 8 }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-soft)'}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>
        <button 
          onClick={() => setCurrentView('signup')}
          className={styles.navButton} 
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          <span>Get Started</span>
        </button>
      </nav>

      {/* Hero Section */}
      <section style={{ padding: '80px 24px 100px', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 24, fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}
        >
          Everything you need.<br/>
          <span style={{ color: 'var(--text-soft)' }}>Nothing you don't.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ fontSize: 'clamp(18px, 3vw, 22px)', color: 'var(--text-soft)', lineHeight: 1.5, maxWidth: 600, margin: '0 auto' }}
        >
          InfoNote seamlessly blends the speed of a linear document with the spatial freedom of an infinite canvas.
        </motion.p>
      </section>

      {/* Bento Box Grid */}
      <section className="bento-grid">
        
        {/* Card 1: Core Loop */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="bento-card col-span-8"
        >
          <div style={{ position: 'relative', zIndex: 10, maxWidth: 460 }}>
            <div style={{ width: 48, height: 48, background: 'rgba(249, 93, 46, 0.1)', color: 'var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid rgba(249, 93, 46, 0.2)' }}>
              <Layers size={24} />
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.02em' }}>Linear to Spatial</h2>
            <p style={{ fontSize: 17, color: 'var(--text-soft)', lineHeight: 1.6 }}>Write fast markdown notes on the left. When ideas get complex, instantly extract any block onto an infinite canvas to map out connections visually.</p>
          </div>
          {/* Aesthetic background graphic */}
          <div style={{ position: 'absolute', right: -100, bottom: -100, opacity: 0.4, pointerEvents: 'none', display: 'flex', gap: 20, transform: 'rotate(-15deg)' }}>
            <div style={{ width: 200, height: 200, borderRadius: 24, border: '1px solid var(--line-strong)', background: 'var(--bg-rail)' }} />
            <div style={{ width: 200, height: 200, borderRadius: 24, border: '1px dashed var(--accent-ink)', background: 'transparent' }} />
          </div>
        </motion.div>

        {/* Card 2: Local First */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ delay: 0.1 }}
          className="bento-card col-span-4"
        >
          <div style={{ width: 48, height: 48, background: 'var(--bg-rail)', color: 'var(--text-main)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid var(--line-strong)' }}>
            <HardDrive size={24} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.02em' }}>Local-First Speed</h2>
          <p style={{ fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.6 }}>Everything saves instantly to your local browser storage. No loading spinners. Cloud sync is completely optional.</p>
        </motion.div>

        {/* Card 3: Kanban */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ delay: 0.15 }}
          className="bento-card col-span-6"
        >
          <div style={{ width: 48, height: 48, background: 'var(--bg-rail)', color: 'var(--text-main)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid var(--line-strong)' }}>
            <Workflow size={24} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.02em' }}>Embedded Kanban</h2>
          <p style={{ fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.6 }}>Drop fully functional Kanban boards directly onto your canvas. Manage tasks contextually next to your research.</p>
          <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12, opacity: 0.5 }}>
             <div style={{ height: 60, flex: 1, background: 'var(--bg-rail)', borderRadius: 8, border: '1px solid var(--line-strong)' }} />
             <div style={{ height: 80, flex: 1, background: 'var(--bg-rail)', borderRadius: 8, border: '1px solid var(--line-strong)' }} />
             <div style={{ height: 40, flex: 1, background: 'var(--bg-rail)', borderRadius: 8, border: '1px solid var(--line-strong)' }} />
          </div>
        </motion.div>

        {/* Card 4: Marketplace */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ delay: 0.2 }}
          className="bento-card col-span-6"
        >
          <div style={{ width: 48, height: 48, background: 'var(--bg-rail)', color: 'var(--text-main)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid var(--line-strong)' }}>
            <Share2 size={24} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.02em' }}>Ecosystem Ready</h2>
          <p style={{ fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.6 }}>Access community templates, blocks, and canvas structures. Don't start from scratch when organizing complex data.</p>
        </motion.div>
      </section>

      {/* Comprehensive Feature Matrix */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 120px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16, letterSpacing: '-0.02em' }}>Everything you get</h2>
          <p style={{ color: 'var(--text-soft)', fontSize: 18 }}>A comprehensive look at InfoNote's capabilities and what's coming next.</p>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--line-strong)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--line-strong)' }}>
                  <th style={{ padding: '20px 24px', fontWeight: 600, color: 'var(--text-soft)', width: '25%' }}>Category</th>
                  <th style={{ padding: '20px 24px', fontWeight: 600, color: 'var(--text-soft)', width: '25%' }}>Feature</th>
                  <th style={{ padding: '20px 24px', fontWeight: 600, color: 'var(--text-soft)', width: '40%' }}>Description</th>
                  <th style={{ padding: '20px 24px', fontWeight: 600, color: 'var(--text-soft)', width: '10%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Visual Workspace */}
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td rowSpan={4} style={{ padding: '20px 24px', fontWeight: 600, verticalAlign: 'top', borderRight: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>Visual Workspace</td>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Infinite Canvas</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Boundless spatial workspace to lay out all your thoughts and research.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Mindmapping</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Create node-based diagrams with directional edges and auto-layout.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Block Extraction</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Drag paragraphs out of linear notes directly onto the canvas.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Canvas Nesting</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Embed entire canvases inside individual nodes for deep hierarchies.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Planned</span></td>
                </tr>

                {/* Linear Notes */}
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td rowSpan={3} style={{ padding: '20px 24px', fontWeight: 600, verticalAlign: 'top', borderRight: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>Linear Notes</td>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Markdown Editor</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Fast, keyboard-centric rich text editing with full Markdown support.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Block Architecture</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Every paragraph is a distinct block that can be moved or referenced.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>AI Text Generation</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Auto-complete, summarize, or expand on your writing using local LLMs.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }}>Upcoming</span></td>
                </tr>

                {/* Organization */}
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td rowSpan={3} style={{ padding: '20px 24px', fontWeight: 600, verticalAlign: 'top', borderRight: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>Organization</td>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Kanban Boards</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Fully functional agile boards that live right inside your canvas.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Bi-directional Links</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Build a personal wiki with back-links (Zettelkasten method).</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }}>Upcoming</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Full-Text Search</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Instantly search across all notes, blocks, and canvases globally.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }}>Upcoming</span></td>
                </tr>

                {/* Infrastructure */}
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td rowSpan={4} style={{ padding: '20px 24px', fontWeight: 600, verticalAlign: 'top', borderRight: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>Infrastructure</td>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Local-First</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Saves directly to your device for zero-latency editing and full offline support.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Cloud Sync</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Optional end-to-end encrypted sync across all your devices.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Beta</span></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Live Collaboration</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Multiplayer cursors and real-time editing with your team.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }}>Upcoming</span></td>
                </tr>
                <tr>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>Plugin Marketplace</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-soft)' }}>Community-driven templates, themes, and feature extensions.</td>
                  <td style={{ padding: '16px 24px' }}><span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>Planned</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </section>

      {/* Footer CTA */}
      <section style={{ padding: '100px 24px', textAlign: 'center', background: 'var(--bg-rail)', borderTop: '1px solid var(--line-strong)' }}>
        <h2 style={{ fontSize: 42, fontWeight: 800, marginBottom: 32, letterSpacing: '-0.02em' }}>Start building your second brain.</h2>
        <button 
          onClick={() => setCurrentView('signup')}
          className={styles.navButton} 
          style={{ padding: '16px 40px', fontSize: 16 }}
        >
          <span>Get Started for Free</span>
        </button>
      </section>
      
    </div>
  );
};
