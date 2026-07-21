import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Cloud, CloudUpload, CloudDownload, History } from 'lucide-react';

interface CloudSyncModalProps {
    open: boolean;
    onClose: () => void;
    onSave: () => void;
    onReload: () => void;
    onRestoreBackup: () => void;
    hasCloudBackup: boolean;
    isAutoSyncEnabled: boolean;
    onAutoSyncChange: (enabled: boolean) => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
    open,
    onClose,
    onSave,
    onReload,
    onRestoreBackup,
    hasCloudBackup,
    isAutoSyncEnabled,
    onAutoSyncChange,
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
                            <Cloud size={20} />
                        </div>
                        <div>
                            <h2 style={title}>Cloud Storage</h2>
                            <p style={subtitle}>Manage your cloud sync and backups</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div style={body}>
                    <div style={cardsContainer}>
                        <button type="button" style={card} onClick={onSave}>
                            <div style={cardIconWrapperSave}>
                                <CloudUpload size={32} />
                            </div>
                            <h3 style={cardTitle}>Save to Cloud</h3>
                            <p style={cardDesc}>
                                Push your current canvas up to the cloud.
                            </p>
                        </button>
                        
                        <button type="button" style={card} onClick={onReload}>
                            <div style={cardIconWrapperLoad}>
                                <CloudDownload size={32} />
                            </div>
                            <h3 style={cardTitle}>Reload Saved Data</h3>
                            <p style={cardDesc}>
                                Browse and load your remote cloud snapshots.
                            </p>
                        </button>

                        {hasCloudBackup && (
                            <button type="button" style={card} onClick={onRestoreBackup}>
                                <div style={cardIconWrapperBackup}>
                                    <History size={32} />
                                </div>
                                <h3 style={cardTitle}>Restore Backup</h3>
                                <p style={cardDesc}>
                                    Restore your canvas from a local pre-reload backup.
                                </p>
                            </button>
                        )}
                    </div>
                    
                    <div style={footerOptions}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                            <input 
                                type="checkbox" 
                                checked={isAutoSyncEnabled} 
                                onChange={(e) => onAutoSyncChange(e.target.checked)} 
                                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                            Auto-sync to cloud
                        </label>
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
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
    fontFamily: 'var(--font-sans)',
};

const modal: React.CSSProperties = {
    width: '100%',
    maxWidth: 640,
    background: 'var(--bg-raised)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--text-main)',
    overflow: 'hidden',
};

const header: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid var(--line)',
};

const title: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
};

const subtitle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-soft)',
    margin: '2px 0 0',
};

const iconBadge: React.CSSProperties = {
    width: 38,
    height: 38,
    background: 'linear-gradient(135deg, var(--accent), var(--secondary))',
    borderRadius: 'var(--radius-md)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--on-accent)',
};

const closeBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--text-soft)',
    width: 32,
    height: 32,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const body: React.CSSProperties = {
    padding: 24,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
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
    background: 'var(--bg-card)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px 16px',
    cursor: 'pointer',
    color: 'var(--text-main)',
    transition: 'all 0.2s ease',
};

const cardIconWrapperSave: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 'var(--radius-xl)',
    background: 'var(--accent-dim)',
    color: 'var(--accent-ink)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
};

const cardIconWrapperLoad: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 'var(--radius-xl)',
    background: 'var(--hover-wash)',
    color: 'var(--text-main)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
};

const cardIconWrapperBackup: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 'var(--radius-xl)',
    background: 'var(--secondary-dim)',
    color: 'var(--secondary-ink)',
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
    color: 'var(--text-soft)',
    margin: 0,
    lineHeight: 1.4,
};

const footerOptions: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
};
