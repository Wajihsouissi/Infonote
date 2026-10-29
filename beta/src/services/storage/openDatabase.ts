/** A blocked upgrade must surface an actionable error instead of leaving
 * startup/recovery pending forever. Late successes are closed, never adopted. */
export function openDatabase(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser does not support local workspace storage.'));
            return;
        }
        let settled = false;
        const timer = setTimeout(() => fail(new Error('Local storage is taking too long to open. Close other tabs for this app, then try again.')), 10000);
        function fail(error: unknown) {
            if (settled) return;
            settled = true; clearTimeout(timer); reject(error);
        }
        let request: IDBOpenDBRequest;
        try { request = indexedDB.open(name, version); }
        catch (error) { fail(error); return; }
        request.onblocked = () => fail(new Error('Another tab is blocking local storage. Close other tabs for this app, then try again.'));
        request.onerror = () => fail(request.error ?? new Error('Could not open local workspace storage.'));
        request.onupgradeneeded = () => {
            if (settled) { request.transaction?.abort(); return; }
            try { upgrade(request.result); }
            catch (error) { request.transaction?.abort(); fail(error); }
        };
        request.onsuccess = () => {
            const db = request.result;
            if (settled) { db.close(); return; }
            settled = true; clearTimeout(timer);
            db.onversionchange = () => db.close();
            resolve(db);
        };
    });
}
