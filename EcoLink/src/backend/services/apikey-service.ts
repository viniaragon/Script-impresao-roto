// ============================================================
// EcoLink - API Key Service
// Manages API keys for user authentication (UUID v4 based)
// ============================================================

import { getDb } from "./db-service.js";
import { v4 as uuidv4 } from "uuid";

export interface ApiKey {
    id: string;
    key: string;
    label: string;
    active: number; // SQLite boolean (0/1)
    created_at: string;
}

/**
 * Initialize the api_keys table (called after DB init).
 */
export function initApiKeysTable(): void {
    getDb().run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    `);
    console.log("✅ API Keys table ready.");
}

/**
 * Generate a new API key with a human-readable label.
 */
export function generateApiKey(label: string = "Sem nome"): ApiKey {
    const id = uuidv4();
    const key = `ek_${uuidv4().replace(/-/g, "")}`;

    getDb().run(
        `INSERT INTO api_keys (id, key, label) VALUES (?, ?, ?)`,
        [id, key, label]
    );

    return getApiKeyById(id)!;
}

/**
 * Validate an API key. Returns the key record if valid, null otherwise.
 */
export function validateApiKey(key: string): ApiKey | null {
    if (!key) return null;
    return getDb()
        .query("SELECT * FROM api_keys WHERE key = ? AND active = 1")
        .get(key) as ApiKey | null;
}

/**
 * List all API keys (for admin panel).
 */
export function listApiKeys(): ApiKey[] {
    return getDb()
        .query("SELECT * FROM api_keys ORDER BY created_at DESC")
        .all() as ApiKey[];
}

/**
 * Revoke (deactivate) an API key.
 */
export function revokeApiKey(id: string): boolean {
    const result = getDb().run(
        "UPDATE api_keys SET active = 0 WHERE id = ?",
        [id]
    );
    return result.changes > 0;
}

/**
 * Delete an API key permanently.
 */
export function deleteApiKey(id: string): boolean {
    const result = getDb().run("DELETE FROM api_keys WHERE id = ?", [id]);
    return result.changes > 0;
}

/**
 * Get a single key by its internal ID.
 */
export function getApiKeyById(id: string): ApiKey | null {
    return getDb()
        .query("SELECT * FROM api_keys WHERE id = ?")
        .get(id) as ApiKey | null;
}
