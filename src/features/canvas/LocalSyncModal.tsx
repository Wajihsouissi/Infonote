import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Save } from 'lucide-react';

interface LocalSyncModalProps {
    open: boolean;
    onClose: () => void;
    onLoad: () => void;
    onSave: () => void;
}

export const LocalSyncModal: React.FC<LocalSyncModalProps> = ({
    open,
    onClose,
    onLoad,
    onSave,
}) => {
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, onClose]);

    if (!open) return null;

    const modalContent = (
        <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
            <div style={modal} onClick={(e) => e.stopPropagation()}>
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={iconBadge}>
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 style={title}>Local Storage</h2>
                            <p style={subtitle}>Manage local canvas data</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div style={body}>
                    <div style={cardsContainer}>
                        <button type="button" style={card} onClick={onLoad}>
                            <div style={cardIconWrapperLoad}>
                                <FolderOpen size={32} />
                            </div>
                            <h3 style={cardTitle}>Load Workspace</h3>
                            <p style={cardDesc}>
                                Select a folder containing previously saved canvas files.
                            </p>
                        </button>
                        <button type="button" style={card} onClick={onSave}>
                            <div style={cardIconWrapperSave}>
                                <Save size={32} />
                            </div>
                            <h3 style={cardTitle}>Save Locally</h3>
                            <p style={cardDesc}>
                                Choose a destination folder to save your current work.
                            </p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 6, 12, 0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
    fontFamily: '"Poppins", system-ui, -apple-system, sans-serif',
};

const modal: React.CSSProperties = {
    width: '100%',
    maxWidth: 540,
    background: 'rgba(20, 22, 32, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    boxShadow: '0 32px 96px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    color: '#fff',
    overflow: 'hidden',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const title: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
};

const subtitle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    margin: '2px 0 0',
};

const iconBadge: React.CSSProperties = {
    width: 38,
    height: 38,
    background: 'linear-gradient(135deg, #10b981, #3b82f6)',
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
};

const closeBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.6)',
    width: 32,
    height: 32,
    borderRadius: 8,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const body: React.CSSProperties = {
    padding: 24,
    flex: 1,
};

const cardsContainer: React.CSSProperties = {
    display: 'flex',
    gap: 16,
};

const card: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: '32px 20px',
    cursor: 'pointer',
    color: '#fff',
    transition: 'all 0.2s ease',
};

const cardIconWrapperLoad: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
};

const cardIconWrapperSave: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
};

const cardTitle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 8px 0',
};

const cardDesc: React.CSSProperties = {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    margin: 0,
    lineHeight: 1.4,
};
