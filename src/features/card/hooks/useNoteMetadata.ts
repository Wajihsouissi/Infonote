import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { defaultIconName } from '../iconMap';

interface NoteMetadataState {
    label: string;
    icon: string;
    description: string;
    category: string;
    coverImage: string;
    date: string;
}

interface UseNoteMetadataOptions {
    id: string;
    data: {
        label?: string;
        icon?: string;
        description?: string;
        category?: string;
        coverImage?: string;
        date?: string;
    } | null;
    onUpdate: (id: string, data: any) => void;
}

/**
 * Hook that manages metadata editing state and handlers for notes.
 * Handles icon selection, title editing, and metadata save operations.
 */
export function useNoteMetadata({ id, data, onUpdate }: UseNoteMetadataOptions) {
    const activeIconMenuId = useStore(s => s.activeIconMenuId);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);

    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [showCoverPicker, setShowCoverPicker] = useState(false);

    const [editedData, setEditedData] = useState<NoteMetadataState>({
        label: data?.label || 'Untitled',
        icon: data?.icon || defaultIconName,
        description: data?.description || '',
        category: data?.category || '',
        coverImage: data?.coverImage || '',
        date: data?.date || new Date().toISOString()
    });

    // Sync state with props
    useEffect(() => {
        if (data) {
            setEditedData({
                label: data.label || 'Untitled',
                icon: data.icon || defaultIconName,
                description: data.description || '',
                category: data.category || '',
                coverImage: data.coverImage || '',
                date: data.date || new Date().toISOString()
            });
        }
    }, [data]);

    const handleSaveMetadata = useCallback(() => {
        onUpdate(id, editedData);
        setIsEditingMetadata(false);
    }, [id, editedData, onUpdate]);

    const handleIconSelect = useCallback((icon: string) => {
        setEditedData(prev => ({ ...prev, icon }));
        if (!isEditingMetadata) {
            onUpdate(id, { icon });
        }
        setActiveIconMenuId(null);
    }, [id, isEditingMetadata, onUpdate, setActiveIconMenuId]);

    const handleIconClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIconMenuId(id);
    }, [id, setActiveIconMenuId]);

    const handleCoverSelect = useCallback((url: string) => {
        onUpdate(id, { coverImage: url });
        setShowCoverPicker(false);
    }, [id, onUpdate]);

    const showIconPicker = activeIconMenuId === id;

    return {
        editedData,
        setEditedData,
        isEditingMetadata,
        setIsEditingMetadata,
        showCoverPicker,
        setShowCoverPicker,
        showIconPicker,
        handleSaveMetadata,
        handleIconSelect,
        handleIconClick,
        handleCoverSelect,
        setActiveIconMenuId,
    };
}
