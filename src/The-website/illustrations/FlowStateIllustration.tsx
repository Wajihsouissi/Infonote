import React from 'react';
import { FileText, Kanban, ChevronRight } from 'lucide-react';
import { SceneStage, Plane, Board, NodeCard, Line, Wires, Wire, Ghost, Chip, PulseDot, Task } from './scene-kit';

export function FlowStateIllustration() {
  return (
    <SceneStage width={600} height={420}>
      <Plane left={0} top={0} width={600} height={420} tiltY={-16} tiltX={6}>

        
        {/* Deep background ghosts for atmospheric depth */}
        <Ghost x={20} y={160} w={200} h={140} float="ftNodeFloat3" tilt={-4} tz={-60} scale={0.8} opacity={0.1}>
          <Line w="60%" />
          <Line w="40%" />
        </Ghost>
        <Ghost x={380} y={40} w={180} h={100} float="ftNodeFloat4" tilt={8} tz={-80} scale={0.7} opacity={0.08}>
          <Line w="50%" />
        </Ghost>

        {/* Wires layer */}
        <Wires z={3}>
          {/* Main animated active connection */}
          <Wire d="M 272 168 C 300 168, 320 236, 342 236" accent delay={0.4} />
          {/* Secondary faint connection to imply network */}
          <Wire d="M 230 90 C 280 90, 300 160, 350 160" delay={0.8} />
        </Wires>

        {/* Card 1: Source Document */}
        <NodeCard
          left={40}
          top={60}
          width={220}
          icon={FileText}
          title="User Interview"
          size="lg"
          delay={0.1}
          z={5}
          badge={<Chip muted>Transcript</Chip>}
          ruled
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Line w="100%" />
              <Line w="85%" />
              <Line w="60%" />
            </div>
            
            {/* Accented Extracted Block */}
            <div style={{ 
              background: 'var(--accent-wash)', 
              border: '1px solid var(--accent-ink)', 
              borderRadius: 'var(--radius-sm)', 
              padding: '12px', 
              position: 'relative',
              boxShadow: 'var(--shadow-sm)',
              transform: 'translateX(8px)', /* subtly pulled out */
              transition: 'transform 0.3s ease'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Line w="90%" fill="var(--accent)" />
                <Line w="65%" fill="var(--accent)" opacity={0.8} />
              </div>
              
              {/* Output Handle with Pulse */}
              <div style={{ 
                position: 'absolute', 
                right: '-12px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                background: 'var(--bg-raised)',
                borderRadius: '50%',
                padding: '2px',
                border: '1px solid var(--line-strong)'
              }}>
                <PulseDot />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.5 }}>
              <Line w="90%" />
              <Line w="40%" />
            </div>
          </div>
        </NodeCard>

        {/* Card 2: Destination Kanban */}
        <NodeCard
          left={350}
          top={120}
          width={240}
          icon={Kanban}
          title="Launch Plan"
          size="lg"
          delay={0.2}
          z={5}
          badge={<Chip accent>Active</Chip>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Normal Tasks */}
            <div style={{ 
              background: 'var(--bg-inset)', 
              borderRadius: 'var(--radius-md)', 
              padding: '12px', 
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <Task w="80%" done />
              <Task w="60%" done />
            </div>

            {/* The Extracted Block arriving as a New Task */}
            <div style={{ 
              background: 'var(--bg-raised)', 
              border: '1px solid var(--accent-ink)', 
              borderRadius: 'var(--radius-md)', 
              padding: '14px', 
              position: 'relative', 
              borderLeft: '4px solid var(--accent)',
              boxShadow: 'var(--shadow-lg)'
            }}>
              {/* Input Handle with Pulse */}
              <div style={{ 
                position: 'absolute', 
                left: '-12px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                background: 'var(--bg-raised)',
                borderRadius: '50%',
                padding: '2px',
                border: '1px solid var(--line-strong)'
              }}>
                <PulseDot />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Line w="85%" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ 
                    fontSize: '11px', 
                    color: 'var(--accent)', 
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    NEW FEATURE <ChevronRight size={12} />
                  </span>
                  {/* Avatar Stack */}
                  <div style={{ display: 'flex' }}>
                    <div style={{ 
                      width: '20px', 
                      height: '20px', 
                      borderRadius: '50%', 
                      background: 'var(--text-main)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '10px', 
                      color: 'var(--bg-base)', 
                      fontWeight: 800,
                      border: '2px solid var(--bg-raised)',
                      zIndex: 2
                    }}>
                      W
                    </div>
                    <div style={{ 
                      width: '20px', 
                      height: '20px', 
                      borderRadius: '50%', 
                      background: 'var(--t-blue)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '10px', 
                      color: '#fff', 
                      fontWeight: 800,
                      border: '2px solid var(--bg-raised)',
                      marginLeft: '-8px',
                      zIndex: 1
                    }}>
                      J
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </NodeCard>
      </Plane>
    </SceneStage>
  );
}
