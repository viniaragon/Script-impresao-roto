// ============================================================
// EcoLink - Admin Routes
// Protected routes for managing API keys
// ============================================================

import { Hono } from "hono";
import {
    generateApiKey,
    listApiKeys,
    revokeApiKey,
    deleteApiKey,
} from "../services/apikey-service.js";

export const admin = new Hono();

// Simple admin password check middleware
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ecolink2025";

admin.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const password = authHeader?.replace("Bearer ", "");

    if (password !== ADMIN_PASSWORD) {
        return c.json({ error: "Acesso negado. Senha admin incorreta." }, 401);
    }
    await next();
});

/**
 * POST /api/admin/keys
 * Generate a new API key
 * Body: { label?: string }
 */
admin.post("/keys", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const label = body.label || "Sem nome";

    const apiKey = generateApiKey(label);
    return c.json({ success: true, apiKey });
});

/**
 * GET /api/admin/keys
 * List all API keys
 */
admin.get("/keys", (c) => {
    const keys = listApiKeys();
    return c.json({ success: true, keys });
});

/**
 * DELETE /api/admin/keys/:id
 * Revoke an API key
 */
admin.delete("/keys/:id", (c) => {
    const id = c.req.param("id");
    const revoked = revokeApiKey(id);

    if (!revoked) {
        return c.json({ error: "Key não encontrada." }, 404);
    }
    return c.json({ success: true, message: "Key revogada." });
});

/**
 * DELETE /api/admin/keys/:id/permanent
 * Permanently delete an API key
 */
admin.delete("/keys/:id/permanent", (c) => {
    const id = c.req.param("id");
    const deleted = deleteApiKey(id);

    if (!deleted) {
        return c.json({ error: "Key não encontrada." }, 404);
    }
    return c.json({ success: true, message: "Key deletada permanentemente." });
});
