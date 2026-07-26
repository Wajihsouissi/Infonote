import React from 'react';
import { Image as ImageIcon, Link2, Target } from 'lucide-react';
import styles from '../MarketingPage.module.css';

/**
 * "Linear notes meet infinite canvas" hero split visual.
 *
 * A Notion-style linear document (with one highlighted block being
 * "chunked") sits in front of a Milanote-style infinite canvas: a field of
 * perspective-tilted ghost blocks, a landed Canvas Node, and a live
 * extraction cursor. The single accent journey runs from the highlighted
 * source block, along the dashed spine, to the canvas node — everything
 * else stays neutral. All colors are design-system tokens.
 */
export const InfiniteCanvasIllustration: React.FC = () => {
  return (
    <div style={{ position: 'absolute', width: '700px', height: '100%', left: '50%', transform: 'translateX(-50%)' }}>

      {/* ── Ghost Blocks (infinite canvas background) ── */}

      {/* Ghost 1: Image Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '380px', top: '10px', width: '150px', height: '110px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-60px) scale(0.85)', opacity: 0.4, display: 'flex', flexDirection: 'column', padding: '12px', gap: '8px' }}>
        <div style={{ flex: 1, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageIcon size={18} color="var(--text-soft)" />
        </div>
      </div>

      {/* Ghost 2: Text Paragraph Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat1}`} style={{ left: '560px', top: '280px', width: '160px', height: '100px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-30px) scale(0.9)', opacity: 0.5, display: 'flex', flexDirection: 'column', padding: '16px', gap: '10px' }}>
        <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'var(--line-strong)' }} />
        <div className={styles.ftUiLine} style={{ width: '85%', height: '4px', background: 'var(--line-strong)' }} />
        <div className={styles.ftUiLine} style={{ width: '95%', height: '4px', background: 'var(--line-strong)' }} />
        <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'var(--line-strong)' }} />
      </div>

      {/* Ghost 3: Video Player Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat4}`} style={{ left: '600px', top: '20px', width: '140px', height: '100px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-120px) scale(0.65)', opacity: 0.5, display: 'flex', flexDirection: 'column', padding: '10px' }}>
        <div style={{ flex: 1, background: 'var(--bg-rail)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line-strong)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>
        </div>
        <div className={styles.ftUiLine} style={{ width: '40%', height: '4px', background: 'var(--line-strong)', marginTop: '8px', alignSelf: 'center' }} />
      </div>

      {/* Ghost 4: Link Card Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat2}`} style={{ left: '360px', top: '330px', width: '160px', height: '60px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-10px) scale(0.95)', opacity: 0.6, display: 'flex', alignItems: 'center', padding: '12px', gap: '12px' }}>
        <div style={{ background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
          <Link2 size={12} color="var(--text-soft)" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Ghost 5: Todo List Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '480px', top: '370px', width: '160px', height: '85px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-80px) scale(0.75)', opacity: 0.5, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-xs)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'var(--line-strong)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-xs)', background: 'var(--bg-rail)' }} />
          <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Ghost 6: Small Attachment / File Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat4}`} style={{ left: '680px', top: '150px', width: '100px', height: '120px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg) translateZ(-150px) scale(0.6)', opacity: 0.5, display: 'flex', flexDirection: 'column', padding: '10px', gap: '8px' }}>
        <div style={{ height: '60px', background: 'var(--bg-rail)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line-strong)' }} />
        <div className={styles.ftUiLine} style={{ width: '80%', height: '4px', background: 'var(--line-strong)', marginTop: '4px' }} />
        <div className={styles.ftUiLine} style={{ width: '50%', height: '4px', background: 'var(--line-strong)' }} />
      </div>

      {/* Ghost 7: Table Placeholder (behind linear doc) */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat2}`} style={{ left: '-20px', top: '10px', width: '220px', height: '110px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-40px) scale(0.85)', opacity: 0.4, display: 'flex', flexDirection: 'column', padding: '0', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-strong)', background: 'var(--bg-rail)', padding: '10px 12px', gap: '10px' }}>
          <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '4px', background: 'var(--line-strong)' }} />
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-strong)', padding: '12px', gap: '10px' }}>
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
        </div>
        <div style={{ display: 'flex', padding: '12px', gap: '10px' }}>
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ flex: 1, height: '3px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Ghost 8: H1 Fused Node Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat1}`} style={{ left: '160px', top: '350px', width: '200px', height: '90px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-100px) scale(0.7)', opacity: 0.4, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', zIndex: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: 'var(--bg-rail)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line-strong)' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-soft)', fontWeight: 'bold' }}>H1</span>
          </div>
          <div className={styles.ftUiLine} style={{ width: '60%', height: '6px', background: 'var(--line-strong)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '26px' }}>
          <div className={styles.ftUiLine} style={{ width: '90%', height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '70%', height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Ghost 9: Color Block Placeholder */}
      <div className={`${styles.ftGhostBlock} ${styles.ftNodeFloat3}`} style={{ left: '-50px', top: '240px', width: '150px', height: '70px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg) translateZ(-20px) scale(0.95)', opacity: 0.5, display: 'flex', alignItems: 'center', padding: '12px', gap: '10px', zIndex: 0, background: 'var(--bg-rail)', border: '1px solid var(--line-strong)' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'var(--line-strong)' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '60%', height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* ── The Linear Doc (Notion style) ── */}
      <div className={`${styles.ftUiCard} ${styles.ftNodeFloat1}`} style={{ width: '280px', transform: 'perspective(1000px) rotateY(12deg) rotateX(4deg)', position: 'absolute', left: '80px', top: '80px', zIndex: 5, background: 'var(--bg-card)', border: '1px solid var(--line-strong)' }}>
        <div className={styles.ftUiCardHeader}>
          <span className={styles.ftUiCardTitle} style={{ fontSize: '15px', color: 'var(--text-main)' }}>Product Requirements</span>
        </div>
        <div className={styles.ftUiCardBody}>
          <div className={styles.ftUiLine} style={{ width: '90%', marginBottom: 8, height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '60%', marginBottom: 16, height: '4px', background: 'var(--line-strong)' }} />

          {/* Highlighted "chunked" block — the single accent moment */}
          <div style={{
            position: 'relative',
            padding: '12px 14px',
            background: 'var(--accent-wash)',
            border: '1px solid var(--accent-dim)',
            borderLeft: '3px solid var(--accent-ink)',
            borderRadius: '6px',
            marginTop: '12px',
            marginBottom: '12px'
          }}>

            {/* Notion-style drag handle (6 dots) */}
            <div style={{ position: 'absolute', left: '-24px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', opacity: 1 }}>
              <div style={{ width: '14px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-rail)', borderRadius: '4px', border: '1px solid var(--line-strong)', cursor: 'grab' }}>
                <svg width="4" height="10" viewBox="0 0 6 10" fill="var(--text-soft)">
                  <circle cx="1" cy="1" r="1.2" />
                  <circle cx="5" cy="1" r="1.2" />
                  <circle cx="1" cy="5" r="1.2" />
                  <circle cx="5" cy="5" r="1.2" />
                  <circle cx="1" cy="9" r="1.2" />
                  <circle cx="5" cy="9" r="1.2" />
                </svg>
              </div>
            </div>

            {/* Block content */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'var(--bg-rail)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent)' }}>
                <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>T</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.02em' }}>Extracted Text Block</span>
            </div>
            <div className={styles.ftUiLine} style={{ width: '90%', height: '4px', background: 'var(--accent)', opacity: 0.5, marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div className={styles.ftUiLine} style={{ width: '50%', height: '4px', background: 'var(--accent)', opacity: 0.3 }} />
              {/* Text cursor indicator */}
              <div style={{ width: '2px', height: '10px', background: 'var(--accent)', borderRadius: '1px' }} />
            </div>
          </div>

          <div className={styles.ftUiLine} style={{ width: '100%', marginTop: 16, height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '40%', marginTop: 8, height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Glowing extraction line connecting linear doc → canvas node */}
      <svg style={{ position: 'absolute', top: 0, left: '20px', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
        <path id="linearToCanvasPath" d="M 280 230 C 340 230, 360 170, 430 170" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="4 4" fill="none" strokeLinecap="round" />
      </svg>

      {/* ── The Infinite Canvas Card (Milanote style) ── */}
      <div className={`${styles.ftUiCard} ${styles.ftNodeFloat2}`} style={{ width: '220px', transform: 'perspective(1000px) rotateY(-12deg) rotateX(4deg)', position: 'absolute', left: '440px', top: '130px', background: 'var(--bg-card)', border: '1px solid var(--line-strong)' }}>
        <div className={styles.ftUiCardHeader}>
          <div className={styles.ftUiIconBox} style={{ background: 'var(--bg-rail)', border: '1px solid var(--line-strong)', color: 'var(--text-main)' }}>
            <Target size={14} />
          </div>
          <span className={styles.ftUiCardTitle} style={{ color: 'var(--text-main)' }}>Canvas Node</span>
        </div>
        <div className={styles.ftUiCardBody}>
          <div className={styles.ftUiLine} style={{ width: '100%', height: '4px', background: 'var(--line-strong)' }} />
          <div className={styles.ftUiLine} style={{ width: '70%', height: '4px', background: 'var(--line-strong)' }} />
        </div>
      </div>

      {/* Floating extraction cursor */}
      <div className={`${styles.ftUiCursor} ${styles.ftCursorAnim2}`} style={{ top: '170px', left: '330px', zIndex: 100 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-main)" stroke="var(--bg-rail)" strokeWidth="1.5" strokeLinejoin="round" style={{ transform: 'scale(1.1)' }}>
          <path d="M0,0 L6,16 L9.5,9.5 L16,6 Z" />
        </svg>
        <div className={styles.ftUiCursorLabel} style={{ background: 'var(--bg-rail)', color: 'var(--text-main)', border: '1px solid var(--line-strong)', fontSize: '9px', padding: '1px 6px' }}>Extracting...</div>
      </div>
    </div>
  );
};
