import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Type, Image, X, Loader2 } from 'lucide-react';
import { generateTextWithGemini, generateImageUrl } from '../../services/aiService';
import { saveCanvasToCloud } from '../../services/cloudSync';
import { useStore } from '../../store/useStore';

interface AIGeneratePanelProps {
    nodeId: string;
    onClose: () => void;
}

export const AIGeneratePanel: React.FC<AIGeneratePanelProps> = ({ nodeId, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [isGeneratingText, setIsGeneratingText] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const updateNodeData = useStore(s => s.updateNodeData);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const triggerCloudSave = useCallback(async () => {
        const { nodes, edges, auth } = useStore.getState();
        const userId = auth.userId;
        if (userId) {
            await saveCanvasToCloud(userId, nodes, edges);
        }
    }, []);

    const handleGenerateText = useCallback(async () => {
        if (!prompt.trim()) return;
        setIsGeneratingText(true);
        setError(null);
        setSuccess(null);

        const result = await generateTextWithGemini(prompt);

        if (result.ok) {
            // Get current node data to preserve existing content
            const node = useStore.getState().nodes.find(n => n.id === nodeId);
            const existingContent = Array.isArray((node?.data as any)?.content)
                ? (node?.data as any).content
                : [];

            // Split generated text into paragraphs and create blocks
            const paragraphs = result.text.split('\n').filter((p: string) => p.trim());
            const newBlocks = paragraphs.map((text: string) => ({
                id: crypto.randomUUID(),
                type: text.startsWith('#') ? 'heading' : 'text',
                content: text.replace(/^#+\s*/, ''),
            }));

            updateNodeData(nodeId, {
                content: [...existingContent, ...newBlocks],
                updatedAt: new Date().toISOString(),
            });

            setSuccess('Text generated successfully!');
            // Trigger cloud save after state update
            setTimeout(() => triggerCloudSave(), 100);
        } else {
            setError(result.error);
        }

        setIsGeneratingText(false);
    }, [prompt, nodeId, updateNodeData, triggerCloudSave]);

    const handleGenerateImage = useCallback(async () => {
        if (!prompt.trim()) return;
        setIsGeneratingImage(true);
        setError(null);
        setSuccess(null);

        const result = generateImageUrl(prompt);

        if (result.ok) {
            updateNodeData(nodeId, {
                coverImage: result.imageUrl,
                updatedAt: new Date().toISOString(),
            });

            setSuccess('Image generated! Loading preview...');
            // Trigger cloud save
            setTimeout(() => triggerCloudSave(), 100);
        } else {
            setError(result.error);
        }

        setIsGeneratingImage(false);
    }, [prompt, nodeId, updateNodeData, triggerCloudSave]);

    const isGenerating = isGeneratingText || isGeneratingImage;

    return (
        <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '8px',
                width: '320px',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(20, 22, 32, 0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column' as const,
                gap: '12px',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a78bfa', fontSize: '13px', fontWeight: 600 }}>
                    <Sparkles size={14} />
                    <span>AI Generate</span>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Prompt Input */}
            <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to generate..."
                disabled={isGenerating}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerateText();
                    }
                }}
                style={{
                    width: '100%',
                    minHeight: '72px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#fff',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                }}
            />

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={handleGenerateText}
                    disabled={isGenerating || !prompt.trim()}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isGeneratingText ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.2)',
                        color: '#a78bfa',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                        opacity: isGenerating || !prompt.trim() ? 0.6 : 1,
                        transition: 'background 0.15s',
                    }}
                >
                    {isGeneratingText ? <Loader2 size={14} className="animate-spin" /> : <Type size={14} />}
                    <span>{isGeneratingText ? 'Generating...' : 'Generate Text'}</span>
                </button>

                <button
                    onClick={handleGenerateImage}
                    disabled={isGenerating || !prompt.trim()}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isGeneratingImage ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.2)',
                        color: '#06b6d4',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                        opacity: isGenerating || !prompt.trim() ? 0.6 : 1,
                        transition: 'background 0.15s',
                    }}
                >
                    {isGeneratingImage ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                    <span>{isGeneratingImage ? 'Generating...' : 'Generate Image'}</span>
                </button>
            </div>

            {/* Status Messages */}
            {error && (
                <div style={{ fontSize: '11px', color: '#f87171', padding: '6px 8px', borderRadius: '6px', background: 'rgba(248,113,113,0.1)' }}>
                    {error}
                </div>
            )}
            {success && (
                <div style={{ fontSize: '11px', color: '#4ade80', padding: '6px 8px', borderRadius: '6px', background: 'rgba(74,222,128,0.1)' }}>
                    {success}
                </div>
            )}
        </div>
    );
};
