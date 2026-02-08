/**
 * Encrypted IndexedDB storage using Web Crypto API (AES-GCM).
 * Falls back to plain localStorage if crypto/IndexedDB unavailable.
 */

const DB_NAME = 'blueprint_secure';
const DB_VERSION = 1;
const DATA_STORE = 'keys';
const CRYPTO_STORE = 'encryption_keys';
const ENCRYPTION_KEY_ID = 'master';

let dbInstance: IDBDatabase | null = null;
let cryptoKeyCache: CryptoKey | null = null;

function isSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto?.subtle !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
      if (!db.objectStoreNames.contains(CRYPTO_STORE)) {
        db.createObjectStore(CRYPTO_STORE);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, store: string, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  if (cryptoKeyCache) return cryptoKeyCache;

  const db = await openDB();
  const stored = await idbGet(db, CRYPTO_STORE, ENCRYPTION_KEY_ID);

  if (stored) {
    cryptoKeyCache = stored;
    return stored;
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  );

  await idbPut(db, CRYPTO_STORE, ENCRYPTION_KEY_ID, key);
  cryptoKeyCache = key;
  return key;
}

async function encrypt(data: string): Promise<{ iv: string; ciphertext: string }> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  };
}

async function decrypt(encrypted: { iv: string; ciphertext: string }): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export const cryptoStorageService = {
  isSupported,

  async saveSecure(key: string, data: any): Promise<void> {
    if (!isSupported()) {
      console.warn('Encrypted storage unavailable, falling back to localStorage');
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch { /* ignore */ }
      return;
    }

    try {
      const db = await openDB();
      const json = JSON.stringify(data);
      const encrypted = await encrypt(json);
      await idbPut(db, DATA_STORE, key, encrypted);
    } catch (err) {
      console.warn('Encrypted save failed, falling back to localStorage:', err);
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch { /* ignore */ }
    }
  },

  async loadSecure(key: string): Promise<any | null> {
    if (!isSupported()) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    try {
      const db = await openDB();
      const encrypted = await idbGet(db, DATA_STORE, key);
      if (!encrypted) return null;
      const json = await decrypt(encrypted);
      return JSON.parse(json);
    } catch (err) {
      console.warn('Encrypted load failed:', err);
      return null;
    }
  },

  async deleteSecure(key: string): Promise<void> {
    if (!isSupported()) {
      localStorage.removeItem(key);
      return;
    }

    try {
      const db = await openDB();
      await idbDelete(db, DATA_STORE, key);
    } catch (err) {
      console.warn('Encrypted delete failed:', err);
    }
  },
};
