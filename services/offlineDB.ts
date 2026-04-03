/**
 * offlineDB.ts
 * Wrapper de IndexedDB para almacenamiento offline:
 * - Cola de sincronizacion (operaciones pendientes)
 * - Cache de datos de lectura (productos, clientes)
 */

const DB_NAME = 'smartcloud-offline';
const DB_VERSION = 1;

export interface SyncItem {
  id: string;
  method: string;
  url: string;
  body: any;
  timestamp: number;
  retries: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('data_cache')) {
        db.createObjectStore('data_cache', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db: IDBDatabase, storeName: string, mode: IDBTransactionMode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const offlineDB = {
  // --- COLA DE SINCRONIZACION ---

  async addToQueue(method: string, url: string, body: any): Promise<string> {
    const db = await openDB();
    const item: SyncItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      method,
      url,
      body,
      timestamp: Date.now(),
      retries: 0
    };
    await promisify(tx(db, 'sync_queue', 'readwrite').put(item));
    db.close();
    return item.id;
  },

  async getQueue(): Promise<SyncItem[]> {
    const db = await openDB();
    const items = await promisify<SyncItem[]>(tx(db, 'sync_queue', 'readonly').getAll());
    db.close();
    return (items || []).sort((a, b) => a.timestamp - b.timestamp);
  },

  async removeFromQueue(id: string): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, 'sync_queue', 'readwrite').delete(id));
    db.close();
  },

  async incrementRetry(id: string): Promise<void> {
    const db = await openDB();
    const store = tx(db, 'sync_queue', 'readwrite');
    const item = await promisify<SyncItem>(store.get(id));
    if (item) {
      item.retries += 1;
      await promisify(store.put(item));
    }
    db.close();
  },

  async clearQueue(): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, 'sync_queue', 'readwrite').clear());
    db.close();
  },

  // --- CACHE DE DATOS ---

  async cacheData(key: string, data: any): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, 'data_cache', 'readwrite').put({ key, data, cachedAt: Date.now() }));
    db.close();
  },

  async getCachedData<T>(key: string): Promise<T | null> {
    const db = await openDB();
    const record = await promisify<any>(tx(db, 'data_cache', 'readonly').get(key));
    db.close();
    return record ? record.data : null;
  },

  async queueCount(): Promise<number> {
    const db = await openDB();
    const count = await promisify<number>(tx(db, 'sync_queue', 'readonly').count());
    db.close();
    return count;
  },

  async getCacheAge(key: string): Promise<number | null> {
    const db = await openDB();
    const record = await promisify<any>(tx(db, 'data_cache', 'readonly').get(key));
    db.close();
    return record ? Date.now() - record.cachedAt : null;
  },

  async removeFromCache(key: string): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, 'data_cache', 'readwrite').delete(key));
    db.close();
  },

  async getAllCacheKeys(): Promise<string[]> {
    const db = await openDB();
    const keys = await promisify<IDBValidKey[]>(tx(db, 'data_cache', 'readonly').getAllKeys());
    db.close();
    return (keys || []) as string[];
  }
};
