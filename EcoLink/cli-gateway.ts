#!/usr/bin/env bun
// ============================================================
// EcoLink - CLI Gateway
// Runs on your PC, connects to Zeabur via WebSocket, 
// and executes Codex CLI for remote report generation.
//
// Usage:
//   bun run cli-gateway.ts --key YOUR_API_KEY --server https://ecolink-alpha.zeabur.app
// ============================================================

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

// ---- Parse CLI args ----

const args = process.argv.slice(2);
let apiKey = "";
let serverUrl = "ws://localhost:3210";

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && args[i + 1]) apiKey = args[i + 1];
    if (args[i] === "--server" && args[i + 1]) {
        serverUrl = args[i + 1]
            .replace("https://", "wss://")
            .replace("http://", "ws://");
    }
}

if (!apiKey) {
    console.error("❌ Uso: bun run cli-gateway.ts --key SUA_API_KEY [--server URL]");
    process.exit(1);
}

// ---- Execute Codex CLI ----

async function executeCodexCLI(systemPrompt: string, userMessage: string): Promise<string> {
    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
    const tmpIn = path.join(os.tmpdir(), `codex-gw-in-${randomUUID()}.txt`);
    const tmpOut = path.join(os.tmpdir(), `codex-gw-out-${randomUUID()}.txt`);

    await fs.writeFile(tmpIn, fullPrompt, "utf-8");

    return new Promise((resolve, reject) => {
        const cmd = process.platform === "win32"
            ? `cmd.exe /c type "${tmpIn}" | codex exec --full-auto -s read-only -o "${tmpOut}" -`
            : `cat "${tmpIn}" | codex exec --full-auto -s read-only -o "${tmpOut}" -`;

        console.log("🔄 Executando Codex CLI...");

        exec(cmd, { timeout: 120_000 }, async (error, stdout, stderr) => {
            try {
                await fs.unlink(tmpIn).catch(() => { });

                if (error) {
                    await fs.unlink(tmpOut).catch(() => { });
                    console.error("❌ Codex CLI error:", error.message);
                    return reject(new Error("Falha no Codex CLI: " + error.message));
                }

                let content = "";
                try {
                    content = await fs.readFile(tmpOut, "utf-8");
                    await fs.unlink(tmpOut).catch(() => { });
                } catch {
                    return reject(new Error("Não foi possível ler a saída do Codex CLI."));
                }

                console.log("✅ Codex CLI respondeu com sucesso!");
                resolve(content.trim());
            } catch (err: any) {
                reject(err);
            }
        });
    });
}

// ---- WebSocket Connection ----

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30_000;

function connect() {
    const wsUrl = `${serverUrl}/ws/gateway?key=${encodeURIComponent(apiKey)}`;
    console.log(`\n🔌 Conectando ao servidor: ${serverUrl}...`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        reconnectAttempts = 0;
        console.log("✅ Conectado ao servidor!");
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());

            if (data.type === "connected") {
                console.log(`🎉 ${data.message}`);
                console.log("⏳ Aguardando pedidos de laudos...\n");
            } else if (data.type === "error") {
                console.error(`❌ Erro do servidor: ${data.message}`);
            } else if (data.type === "request") {
                console.log(`📨 Pedido recebido (ID: ${data.requestId})`);

                try {
                    const content = await executeCodexCLI(data.systemPrompt, data.userMessage);

                    ws.send(JSON.stringify({
                        type: "response",
                        requestId: data.requestId,
                        content,
                        model: "gpt-5-codex-cli",
                    }));

                    console.log(`✅ Resposta enviada (ID: ${data.requestId})\n`);
                } catch (err: any) {
                    ws.send(JSON.stringify({
                        type: "response",
                        requestId: data.requestId,
                        error: err.message,
                    }));

                    console.error(`❌ Erro ao processar pedido: ${err.message}\n`);
                }
            } else if (data.type === "pong") {
                // Heartbeat response, ignore
            }
        } catch (err) {
            console.error("❌ Erro ao processar mensagem:", err);
        }
    };

    ws.onclose = (event) => {
        console.log(`🔌 Desconectado (código: ${event.code})`);

        if (event.code === 4001) {
            console.error("❌ API Key inválida. Verifique sua chave.");
            process.exit(1);
        }

        if (event.code === 4002) {
            console.error("❌ Outro gateway já está conectado.");
            process.exit(1);
        }

        // Auto-reconnect with exponential backoff
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
        console.log(`🔄 Reconectando em ${delay / 1000}s...`);
        setTimeout(connect, delay);
    };

    ws.onerror = (event) => {
        console.error("❌ Erro de conexão WebSocket");
    };

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        } else {
            clearInterval(heartbeat);
        }
    }, 30_000);
}

// ---- Start ----

console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🔌  EcoLink - CLI Gateway                  ║
║                                              ║
║   Ponte entre seu Codex CLI e o servidor     ║
║                                              ║
╚══════════════════════════════════════════════╝
`);

connect();
