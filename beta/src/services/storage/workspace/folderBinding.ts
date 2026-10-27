import { openDatabase } from '../openDatabase';

export interface FolderDirectory extends FileSystemDirectoryHandle {
    queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
    requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
export interface FolderBinding { handle: FolderDirectory; commit: string | null }

/** Remember the directory grant and the last commit this tab published. */
export async function storedFolderBinding(value?: FolderBinding | null): Promise<FolderBinding | null> {
    const db = await openDatabase('chnk-it-folder-binding', 1, db => { db.createObjectStore('binding'); });
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('binding', value === undefined ? 'readonly' : 'readwrite');
            const store = tx.objectStore('binding');
            const r = value === undefined ? store.get('workspace') : value ? store.put(value, 'workspace') : store.delete('workspace');
            let result: FolderBinding | null = null;
            r.onsuccess = () => { result = value === undefined ? r.result ?? null : value; };
            tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
}
