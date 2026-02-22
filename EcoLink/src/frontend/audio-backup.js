// ============================================================
// EcoLink - Audio Backup (IndexedDB)
// Saves audio blobs locally before sending to protect
// against network failures. Zero latency impact.
// ============================================================

const DB_NAME = "EcoLinkAudioBackup";
const DB_VERSION = 1;
const STORE_NAME = "pendingAudio";

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
}

/**
 * Save audio blob to IndexedDB before sending.
 * Returns a unique backup ID.
 */
async function saveAudioBackup(audioBlob, patientName) {
    try {
        const db = await openDB();
        const id = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const record = {
            id,
            blob: audioBlob,
            patientName: patientName || "",
            timestamp: new Date().toISOString(),
            status: "pending", // pending | sent | failed
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => {
                console.log(`💾 [audio-backup] Áudio salvo localmente: ${id}`);
                resolve(id);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.warn("[audio-backup] Falha ao salvar backup:", err);
        return null; // Don't block the flow
    }
}

/**
 * Remove a backup after successful transcription.
 */
async function removeAudioBackup(id) {
    if (!id) return;
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => {
                console.log(`🗑️ [audio-backup] Backup removido: ${id}`);
                resolve();
            };
            tx.onerror = () => resolve(); // Don't fail
        });
    } catch (err) {
        console.warn("[audio-backup] Falha ao remover backup:", err);
    }
}

/**
 * Mark a backup as failed for retry.
 */
async function markBackupFailed(id) {
    if (!id) return;
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (record) {
                    record.status = "failed";
                    store.put(record);
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (err) {
        console.warn("[audio-backup] Falha ao marcar backup:", err);
    }
}

/**
 * Get all pending/failed audio backups.
 */
async function getPendingBackups() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const getAll = store.getAll();
            getAll.onsuccess = () => {
                const records = getAll.result.filter(
                    (r) => r.status === "pending" || r.status === "failed"
                );
                resolve(records);
            };
            getAll.onerror = () => resolve([]);
        });
    } catch (err) {
        return [];
    }
}

/**
 * Get a specific backup by ID.
 */
async function getBackupById(id) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const getReq = tx.objectStore(STORE_NAME).get(id);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
        });
    } catch (err) {
        return null;
    }
}
