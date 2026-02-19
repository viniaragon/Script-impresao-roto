// ============================================================
// EcoLink - Auth Service (Codex CLI Token Reader)
// Reads the OAuth token saved by the Codex CLI after login.
// User authenticates via `codex` CLI, we read the saved token.
// ============================================================

import path from "path";
import os from "os";

// Path where Codex CLI stores auth tokens
const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");

// Session state
export interface AuthSession {
    provider: "openrouter" | "chatgpt";
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userEmail?: string;
}

let currentSession: AuthSession = {
    provider: "openrouter",
};

/**
 * Read the Codex CLI auth token from ~/.codex/auth.json
 * Format: { "token": "...", "refresh_token": "...", "expires_at": ... }
 * or:     { "access_token": "...", ... }
 */
export async function loadCodexToken(): Promise<boolean> {
    try {
        const file = Bun.file(CODEX_AUTH_PATH);
        if (!(await file.exists())) {
            console.log("ℹ️  Codex CLI token not found at:", CODEX_AUTH_PATH);
            return false;
        }

        const content = await file.text();
        const data = JSON.parse(content) as Record<string, any>;

        // The Codex CLI may store the token in different formats
        const accessToken =
            data.access_token ||
            data.token ||
            data.api_key ||
            data.OPENAI_API_KEY ||
            data.tokens?.access_token ||
            data.tokens?.id_token;

        if (!accessToken) {
            console.warn("⚠️  Codex auth.json found but no token inside");
            return false;
        }

        currentSession = {
            provider: "chatgpt",
            accessToken,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_at ? data.expires_at * 1000 : undefined,
            userEmail: data.email || data.user,
        };

        console.log("✅ Codex CLI token loaded successfully!");
        return true;
    } catch (err: any) {
        console.error("❌ Failed to read Codex token:", err.message);
        return false;
    }
}

/**
 * Manually set a ChatGPT/OpenAI API key or token
 */
export function setManualToken(token: string, email?: string): void {
    currentSession = {
        provider: "chatgpt",
        accessToken: token,
        userEmail: email,
    };
    console.log("✅ ChatGPT token set manually");
}

// ---- Session Management ----

export function getSession(): AuthSession {
    return { ...currentSession };
}

export function getActiveProvider(): "openrouter" | "chatgpt" {
    return currentSession.provider;
}

export function setProvider(provider: "openrouter" | "chatgpt"): void {
    currentSession.provider = provider;
}

export function isAuthenticated(): boolean {
    if (currentSession.provider !== "chatgpt") return false;
    if (!currentSession.accessToken) return false;
    // Check expiry if we have it
    if (currentSession.expiresAt && currentSession.expiresAt < Date.now()) return false;
    return true;
}

export function getAccessToken(): string {
    if (!currentSession.accessToken) {
        throw new Error("Not authenticated with ChatGPT.");
    }
    return currentSession.accessToken;
}

export function logout(): void {
    currentSession = { provider: "openrouter" };
    console.log("🔓 Switched back to OpenRouter");
}

export function getCodexAuthPath(): string {
    return CODEX_AUTH_PATH;
}
