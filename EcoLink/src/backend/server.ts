// ============================================================
// EcoLink - Main Server
// Hono server with static file serving for the frontend
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import path from "path";
import { initDatabase } from "./services/db-service.js";
import { initAIService } from "./services/ai-service.js";
import { initApiKeysTable } from "./services/apikey-service.js";
import { handleGatewayConnection, handleGatewayMessage, handleGatewayClose } from "./services/gateway-hub.js";
import { api } from "./routes/api.js";
import { auth } from "./routes/auth.js";
import { admin } from "./routes/admin.js";

// Load environment variables
const envPath = path.join(import.meta.dir, "../../.env");
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
    const envContent = await envFile.text();
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=");
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join("=").trim();
            }
        }
    }
}

const PORT = Number(process.env.PORT || 3210);

// Initialize services
initDatabase();
initApiKeysTable();

const openRouterKey = process.env.OPENROUTER_API_KEY;
if (!openRouterKey) {
    console.warn("⚠️  OPENROUTER_API_KEY não configurada! Configure no .env.");
    console.warn("   O servidor vai iniciar, mas a geração de laudos não funcionará.");
} else {
    initAIService(openRouterKey, process.env.AI_MODEL);
}

// Create Hono app
const app = new Hono();

// CORS
app.use("*", cors());

// API routes under /api
app.route("/api", api);

// Auth routes under /auth
app.route("/auth", auth);

// Admin routes under /api/admin
app.route("/api/admin", admin);

// Serve frontend static files
const frontendDir = path.join(import.meta.dir, "../frontend");
app.use("/*", serveStatic({ root: frontendDir }));

// Fallback to index.html for SPA routing
app.get("*", async (c) => {
    const indexPath = path.join(frontendDir, "index.html");
    const file = Bun.file(indexPath);
    if (await file.exists()) {
        return c.html(await file.text());
    }
    return c.text("EcoLink - Frontend not found", 404);
});

console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🩺  EcoLink - Laudos de Ultrasonografia    ║
║                                              ║
║   Servidor rodando em:                       ║
║   http://localhost:${PORT}                     ║
║                                              ║
╚══════════════════════════════════════════════╝
`);

// ---- Bun Server with WebSocket support ----

const server = Bun.serve<{ apiKey: string }>({
    port: PORT,
    fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade for CLI Gateway
        if (url.pathname === "/ws/gateway") {
            const apiKey = url.searchParams.get("key") || "";
            const upgraded = server.upgrade(req, { data: { apiKey } });
            if (upgraded) return undefined;
            return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // All other requests go to Hono
        return app.fetch(req);
    },
    websocket: {
        open(ws) {
            const apiKey = (ws.data as any)?.apiKey || "";
            handleGatewayConnection(ws, apiKey);
        },
        message(ws, message) {
            handleGatewayMessage(ws, message as string);
        },
        close(ws) {
            handleGatewayClose(ws);
        },
    },
});

console.log(`🌐 WebSocket Gateway disponível em ws://localhost:${PORT}/ws/gateway`);

