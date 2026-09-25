
const DB_NAME = 'building_task_manager_offline_db';
const STORE_NAME = 'mutations';
const DB_VERSION = 2;

export class IDBStorage {
    private static dbPromise: Promise<IDBDatabase> | null = null;

    private static getDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined') {
                return reject(new Error('IndexedDB not supported on server side'));
            }

            const openDB = (isRetry = false) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => {
                    // Handle version mismatch (higher version stored than requested)
                    if (request.error?.name === 'VersionError' && !isRetry) {
                        console.warn('IndexedDB version mismatch. Deleting database and retrying...');
                        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                        deleteRequest.onsuccess = () => openDB(true);
                        deleteRequest.onerror = () => reject(request.error);
                    } else {
                        reject(request.error);
                    }
                };

                request.onsuccess = () => resolve(request.result);

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
            };

            openDB();
        });
        return this.dbPromise;
    }

    static async set<T>(key: string, value: T): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    static async get<T>(key: string): Promise<T | null> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result === undefined ? null : result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    static async remove(key: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    static async clear(): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    static async clearCache(): Promise<void> {
        return this.clear();
    }

    static async getAllCache<T>(): Promise<T[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async setBlob(key: string, blob: Blob): Promise<void> {
        return this.set(key, blob);
    }
}
