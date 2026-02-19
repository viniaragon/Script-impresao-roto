// ============================================================
// EcoLink - Auth Routes
// Handles ChatGPT auth via Codex CLI token + manual token input
// ============================================================

import { Hono } from "hono";
import {
    loadCodexToken,
    setManualToken,
    getSession,
    isAuthenticated,
    logout,
    setProvider,
    getActiveProvider,
    getCodexAuthPath,
} from "../services/auth-service.js";

export const auth = new Hono();

/**
 * POST /auth/connect-codex
 * Tries to read the Codex CLI token from ~/.codex/auth.json
 */
auth.post("/connect-codex", async (c) => {
    const success = await loadCodexToken();
    if (success) {
        return c.json({
            success: true,
            message: "Token do Codex CLI carregado com sucesso!",
            provider: "chatgpt",
        });
    } else {
        return c.json({
            success: false,
            message: `Token não encontrado. Execute 'codex' no terminal para autenticar. Caminho esperado: ${getCodexAuthPath()}`,
        }, 404);
    }
});

/**
 * POST /auth/set-token
 * Manually set an OpenAI API key or token
 */
auth.post("/set-token", async (c) => {
    const body = await c.req.json();
    const { token, email } = body;

    if (!token?.trim()) {
        return c.json({ error: "Token/API key is required." }, 400);
    }

    setManualToken(token.trim(), email);
    return c.json({ success: true, provider: "chatgpt" });
});

/**
 * GET /auth/status
 * Returns current authentication status
 */
auth.get("/status", (c) => {
    const session = getSession();
    return c.json({
        authenticated: isAuthenticated(),
        provider: getActiveProvider(),
        userEmail: session.userEmail || null,
        codexPath: getCodexAuthPath(),
    });
});

/**
 * POST /auth/provider
 * Switch between providers (openrouter / chatgpt)
 */
auth.post("/provider", async (c) => {
    const body = await c.req.json();
    const provider = body.provider;

    if (provider !== "openrouter" && provider !== "chatgpt") {
        return c.json({ error: "Provider inválido. Use 'openrouter' ou 'chatgpt'." }, 400);
    }

    if (provider === "chatgpt" && !isAuthenticated()) {
        return c.json({ error: "Conecte o Codex CLI ou insira um token primeiro." }, 401);
    }

    setProvider(provider);
    return c.json({ success: true, provider });
});

/**
 * POST /auth/logout
 * Clears the current ChatGPT session, switches back to OpenRouter
 */
auth.post("/logout", (c) => {
    logout();
    return c.json({ success: true, message: "Desconectado do ChatGPT." });
});
