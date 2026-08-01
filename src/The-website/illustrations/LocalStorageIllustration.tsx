import React from 'react';
import { ShieldCheck, HardDrive, Lock } from 'lucide-react';
import { SceneStage, Plane, Board, NodeCard, Ghost, Line } from './scene-kit';

export function LocalStorageIllustration() {
  return (
    <SceneStage width={400} height={380}>
      <Plane left={0} top={0} width={400} height={380} tiltY={-14} tiltX={6}>

        
        <Ghost x={40} y={120} w={200} h={100} float="ftNodeFloat3" tilt={-4} tz={-40} scale={0.9} opacity={0.15}>
          <Line w="60%" />
          <Line w="40%" />
        </Ghost>
        
        <NodeCard
          left={60}
          top={80}
          width={280}
          icon={ShieldCheck}
          title="Security"
          size="lg"
          delay={0.1}
          z={5}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 0' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Saved securely</span>
            <span style={{ fontSize: '13px', color: 'var(--text-soft)', marginBottom: '24px' }}>Encrypted on your local disk</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line-strong)', width: '100%' }}>
              <HardDrive size={14} color="var(--text-soft)" />
              <span style={{ fontSize: '12px', color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ~/local_data/vault.enc
              </span>
              <Lock size={12} color="var(--text-main)" />
            </div>
          </div>
        </NodeCard>
      </Plane>
    </SceneStage>
  );
}
