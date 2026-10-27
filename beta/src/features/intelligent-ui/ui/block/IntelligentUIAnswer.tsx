import { useCallback, useState } from 'react';
import { Download } from '../../../../shared/icons';
import { useStore } from '../../../../store/useStore';
import { useReactFlow } from '@xyflow/react';
import { IntelligentUIFrame } from '../preview/IntelligentUIFrame';
import { placeIntelligentUI } from '../../placeIntelligentUI';
import type { AIAssistantMessage } from '../../../ai/aiTypes';
import type { UIControlState } from '../../types';
import { nativeUIContent } from '../../nativeBlocks';
import { BlockEditor } from '../../../editor/ui/surface/BlockEditor';
import styles from '../styles/IntelligentUI.module.css';
import { requestUIFollowUp } from '../../followUp';

export function IntelligentUIAnswer({ message }: { message: AIAssistantMessage }) {
    const { screenToFlowPosition, getViewport } = useReactFlow();
    const updateAITurn = useStore(s => s.updateAITurn);
    const artifact = message.intelligentUI;
    const [exportError, setExportError] = useState('');
    const saveState = useCallback((state: UIControlState, id?: string) => {
        const current = useStore.getState().aiMessages.find(m => m.id === message.id);
        const saved = current?.role === 'assistant' ? current.intelligentUI : undefined;
        if (saved && saved.id === id) {
            if (JSON.stringify(saved.state ?? {}) !== JSON.stringify(state))
                updateAITurn(message.id, { intelligentUI: { ...saved, state } });
        }
    }, [message.id, updateAITurn]);
    if (!artifact) return null;
    const content = nativeUIContent(artifact);
    return <div className={styles.answer}>
        {content.before.length > 0 && <BlockEditor initialContent={content.before} readOnly minimal />}
        <div className={styles.block}><IntelligentUIFrame artifact={artifact} onState={saveState} onPrompt={request => requestUIFollowUp(artifact, request)} /></div>
        {content.after.length > 0 && <BlockEditor initialContent={content.after} readOnly minimal />}
        {exportError && <p className={styles.error} role="alert">{exportError}</p>}
        <div className={styles.keepActions}><button type="button" className={styles.iconButton} title="Download HTML" aria-label="Download interface" onClick={() => {
            const latest = useStore.getState().aiMessages.find(m => m.id === message.id);
            const saved = latest?.role === 'assistant' ? latest.intelligentUI : undefined;
            void import('../../exportUI').then(({ downloadUI }) => downloadUI(saved ?? artifact)).catch(err => setExportError(String(err.message ?? err)));
        }}><Download size={15} aria-hidden="true" /></button><button type="button" className={styles.keepButton} onClick={() => {
            const state = useStore.getState();
            const id = placeIntelligentUI(artifact, {
                origin: screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
                viewport: () => ({ ...getViewport(), screenW: window.innerWidth, screenH: window.innerHeight }),
                currentParentId: state.currentParentId,
                provenance: message.provenance,
                step: () => '', settle: () => {},
            });
            updateAITurn(message.id, { createdNodeIds: [...message.createdNodeIds, id] });
            window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [id] } }));
        }}>Keep as a block</button></div>
    </div>;
}
