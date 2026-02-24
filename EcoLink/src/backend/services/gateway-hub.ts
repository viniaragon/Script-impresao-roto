// ============================================================
// EcoLink - Gateway Hub Service
// Manages WebSocket connection with the CLI Gateway
// Uses Bun's native ServerWebSocket callback pattern
// ============================================================

import { validateApiKey } from "./apikey-service.js";

// ---- Types ----

interface PendingRequest {
    resolve: (result: GatewayResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

interface GatewayResponse {
    content: string;
    model: string;
    provider: string;
}

// ---- State ----

let gatewaySocket: any = null;  // The connected CLI Gateway WebSocket
let gatewayLabel: string = "";
const pendingRequests = new Map<string, PendingRequest>();

const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes (Codex CLI can be slow)

// ---- Gateway Status ----

export function isGatewayOnline(): boolean {
    return gatewaySocket !== null;
}

export function getGatewayInfo(): { online: boolean; label: string } {
    return {
        online: isGatewayOnline(),
        label: gatewayLabel,
    };
}

// ---- Bun ServerWebSocket Callbacks ----

/**
 * Called by Bun's websocket.open handler.
 */
export function handleGatewayConnection(ws: any, apiKey: string): void {
    const keyRecord = validateApiKey(apiKey);
    if (!keyRecord) {
        ws.send(JSON.stringify({ type: "error", message: "API key inválida." }));
        ws.close(4001, "Invalid API key");
        return;
    }

    // Only one gateway at a time
    if (gatewaySocket) {
        ws.send(JSON.stringify({ type: "error", message: "Outro gateway já está conectado." }));
        ws.close(4002, "Gateway already connected");
        return;
    }

    gatewaySocket = ws;
    gatewayLabel = keyRecord.label;
    console.log(`🔌 CLI Gateway conectado: "${gatewayLabel}"`);

    ws.send(JSON.stringify({
        type: "connected",
        message: `Gateway "${gatewayLabel}" conectado com sucesso!`,
    }));
}

/**
 * Called by Bun's websocket.message handler.
 */
export function handleGatewayMessage(ws: any, rawMessage: string | Buffer): void {
    // Only process messages from the connected gateway
    if (ws !== gatewaySocket) return;

    try {
        const data = typeof rawMessage === "string"
            ? JSON.parse(rawMessage)
            : JSON.parse(rawMessage.toString());

        if (data.type === "response" && data.requestId) {
            const pending = pendingRequests.get(data.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingRequests.delete(data.requestId);

                if (data.error) {
                    pending.reject(new Error(data.error));
                } else {
                    pending.resolve({
                        content: data.content,
                        model: data.model || "codex-cli-remote",
                        provider: "cli-gateway",
                    });
                }
            }
        } else if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
        }
    } catch (err) {
        console.error("❌ Gateway message parse error:", err);
    }
}

/**
 * Called by Bun's websocket.close handler.
 */
export function handleGatewayClose(ws: any): void {
    if (ws !== gatewaySocket) return;

    console.log(`🔌 CLI Gateway desconectado: "${gatewayLabel}"`);
    gatewaySocket = null;
    gatewayLabel = "";

    // Reject all pending requests
    for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("CLI Gateway desconectou durante a requisição."));
        pendingRequests.delete(id);
    }
}

// ---- Send Request to Gateway ----

/**
 * Send a report generation request to the CLI Gateway.
 * Returns a promise that resolves when the gateway sends the result.
 */
export function sendToGateway(
    requestId: string,
    systemPrompt: string,
    userMessage: string
): Promise<GatewayResponse> {
    return new Promise((resolve, reject) => {
        if (!isGatewayOnline()) {
            reject(new Error("CLI Gateway não está conectado."));
            return;
        }

        const timeout = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error("Timeout: CLI Gateway não respondeu em 2 minutos."));
        }, REQUEST_TIMEOUT_MS);

        pendingRequests.set(requestId, { resolve, reject, timeout });

        gatewaySocket.send(JSON.stringify({
            type: "request",
            requestId,
            systemPrompt,
            userMessage,
        }));
    });
}
