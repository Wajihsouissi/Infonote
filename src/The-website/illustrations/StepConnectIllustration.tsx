import React from 'react';
import { motion } from 'framer-motion';
import { Share2, CheckCircle2, Link2, Layout, FileText, Image as ImageIcon } from 'lucide-react';
import { IllustrationStage, STAGE_TILT, SharedTitleMock, SharedVideoMock, TextLine } from './mock-elements';

interface StepConnectIllustrationProps {
  activeStep: number;
}

/** Shared shell for the four satellite nodes floating around the source chunk. */
const SatelliteNode: React.FC<{
  width: number;
  position: React.CSSProperties;
  floatDuration: number;
  floatDelay: number;
  children: React.ReactNode;
}> = ({ width, position, floatDuration, floatDelay, children }) => (
  <motion.div
    animate={{ y: [0, -4, 0] }}
    transition={{ duration: floatDuration, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
    style={{
      position: 'absolute',
      width,
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--line-strong)',
      padding: '16px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: 2,
      ...position,
    }}
  >
    {children}
  </motion.div>
);

const NodeHeader: React.FC<{ icon: React.ReactNode; label: string; color?: string }> = ({
  icon,
  label,
  color = 'var(--text-soft)',
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    {icon}
    <span style={{ fontSize: '10px', color, fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
  </div>
);

export function StepConnectIllustration({ activeStep }: StepConnectIllustrationProps) {
  return (
    <IllustrationStage minHeight={700}>
      {/* 3D Graph Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: STAGE_TILT,
          transformStyle: 'preserve-3d',
          transformOrigin: 'center center',
        }}
      >
        {/* Architectural Connection Lines (SVG) */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
          <defs>
            <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
              <circle cx="5" cy="5" r="4" fill="var(--bg-base)" stroke="var(--accent)" strokeWidth="1.5" />
            </marker>
            <marker id="dot-secondary" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
              <circle cx="5" cy="5" r="4" fill="var(--bg-base)" stroke="var(--text-soft)" strokeWidth="1.5" />
            </marker>
          </defs>

          <line x1="50%" y1="50%" x2="80%" y2="25%" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot-secondary)" />
          <line x1="50%" y1="50%" x2="80%" y2="75%" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot)" />
          <line x1="50%" y1="50%" x2="20%" y2="25%" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot)" />
          <line x1="50%" y1="50%" x2="20%" y2="75%" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#dot-secondary)" />
        </svg>

        {/* Central Node (The Extracted Chunk from Step 2) */}
        <div
          style={{
            position: 'relative',
            width: '340px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--accent)',
            padding: '24px',
            zIndex: 5,
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-strong)', paddingBottom: '12px' }}>
            <div style={{ background: 'var(--accent)', color: 'var(--bg-base)', padding: '4px 8px', borderRadius: 'var(--radius-xs)', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em' }}>
              SOURCE CHUNK
            </div>
            <Share2 size={14} color="var(--text-soft)" />
          </div>

          <div style={{ minHeight: '32px', display: 'flex', alignItems: 'center' }}>
            {activeStep >= 2 && <SharedTitleMock fontSize={22}>How to Master AI in 2026</SharedTitleMock>}
          </div>

          <div style={{ width: '100%', aspectRatio: '16/9', position: 'relative' }}>
            {activeStep >= 2 && <SharedVideoMock size="sm" />}
          </div>
        </div>

        {/* Top Right Node: Script */}
        <SatelliteNode
          width={180}
          position={{ top: '25%', left: '80%', transform: 'translate(-50%, -50%)' }}
          floatDuration={4}
          floatDelay={0.2}
        >
          <NodeHeader icon={<FileText size={12} color="var(--text-soft)" />} label="SCRIPT DRAFT" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <TextLine width="100%" fill="var(--text-main)" opacity={0.8} />
            <TextLine width="85%" fill="var(--text-main)" opacity={0.8} />
            <TextLine width="90%" />
            <TextLine width="60%" />
          </div>
        </SatelliteNode>

        {/* Bottom Right Node: Links */}
        <SatelliteNode
          width={200}
          position={{ top: '75%', left: '80%', transform: 'translate(-50%, -50%)' }}
          floatDuration={5}
          floatDelay={1.2}
        >
          <NodeHeader icon={<Link2 size={12} color="var(--accent)" />} label="REFERENCES" color="var(--accent)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 2].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-raised)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: 'var(--radius-xs)', background: 'var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layout size={10} color="var(--text-soft)" />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <TextLine width="80%" height={3} fill="var(--text-soft)" />
                  <TextLine width="50%" height={3} />
                </div>
              </div>
            ))}
          </div>
        </SatelliteNode>

        {/* Top Left Node: Todo */}
        <SatelliteNode
          width={180}
          position={{ top: '25%', right: '80%', transform: 'translate(50%, -50%)' }}
          floatDuration={4.5}
          floatDelay={0.8}
        >
          <NodeHeader icon={<CheckCircle2 size={12} color="var(--accent)" />} label="ACTION ITEMS" color="var(--text-main)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: 'var(--radius-xs)', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div style={{ flex: 1, height: '4px', background: 'var(--line-strong)', borderRadius: '2px', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', height: '1px', background: 'var(--text-soft)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--line-strong)' }} />
              <TextLine width="80%" fill="var(--text-main)" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--line-strong)' }} />
              <TextLine width="60%" fill="var(--text-main)" />
            </div>
          </div>
        </SatelliteNode>

        {/* Bottom Left Node: Inspiration */}
        <SatelliteNode
          width={160}
          position={{ top: '75%', right: '80%', transform: 'translate(50%, -50%)' }}
          floatDuration={5.5}
          floatDelay={1.5}
        >
          <NodeHeader icon={<ImageIcon size={12} color="var(--text-soft)" />} label="ASSETS" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ width: 'calc(50% - 4px)', aspectRatio: '1', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line-strong)', backgroundImage: 'linear-gradient(45deg, var(--line) 25%, transparent 25%, transparent 75%, var(--line) 75%, var(--line)), linear-gradient(45deg, var(--line) 25%, transparent 25%, transparent 75%, var(--line) 75%, var(--line))', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }} />
            <div style={{ width: 'calc(50% - 4px)', aspectRatio: '1', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line-strong)' }} />
            <div style={{ width: '100%', height: '24px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-soft)' }}>+</span>
            </div>
          </div>
        </SatelliteNode>
      </div>
    </IllustrationStage>
  );
}
