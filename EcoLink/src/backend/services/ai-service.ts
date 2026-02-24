// ============================================================
// EcoLink - AI Service (Multi-Provider)
// Supports both OpenRouter (free models) and ChatGPT OAuth
// for generating ultrasound reports from raw dictation.
// ============================================================

import { MASTER_PROMPT } from "../prompts/prompt-configs.js";
import {
    getActiveProvider,
    getAccessToken,
    isAuthenticated,
} from "./auth-service.js";
import { isGatewayOnline, sendToGateway, getGatewayInfo } from "./gateway-hub.js";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

// ---- Configuration ----

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

let openRouterApiKey: string | null = null;
let openRouterModel: string = "z-ai/glm-4.5-air:free";
const chatGptModel: string = "gpt-4o-mini"; // Best value for medical reports

export function initAIService(key: string, model?: string): void {
    openRouterApiKey = key;
    if (model) openRouterModel = model;
    console.log(`✅ AI Service initialized with OpenRouter (model: ${openRouterModel})`);
}

// ---- Types ----

export interface GenerateReportRequest {
    rawInput: string;
    additionalContext?: string;
}

export interface GenerateReportResponse {
    report: string;
    examType: string;
    model: string;
    provider: string;
    tokensUsed?: number;
}

// ---- Provider-agnostic API Call ----

async function callAI(
    systemPrompt: string,
    userMessage: string,
    temperature: number = 0.3,
    useGateway: boolean = false
): Promise<{ content: string; model: string; provider: string; tokensUsed?: number }> {
    // If gateway is requested and online, use it
    if (useGateway && isGatewayOnline()) {
        console.log("🔌 Usando CLI Gateway para gerar laudo...");
        const requestId = randomUUID();
        return sendToGateway(requestId, systemPrompt, userMessage);
    }

    const provider = getActiveProvider();

    if (provider === "chatgpt") {
        return callChatGPT(systemPrompt, userMessage, temperature);
    } else {
        return callOpenRouter(systemPrompt, userMessage, temperature);
    }
}

// Re-export gateway info for API routes
export { isGatewayOnline, getGatewayInfo };

// ---- OpenRouter ----

async function callOpenRouter(
    systemPrompt: string,
    userMessage: string,
    temperature: number
): Promise<{ content: string; model: string; provider: string; tokensUsed?: number }> {
    if (!openRouterApiKey) {
        throw new Error("OpenRouter API key not configured.");
    }

    const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3210",
            "X-Title": "EcoLink - Laudos de Ultrasonografia",
        },
        body: JSON.stringify({
            model: openRouterModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            temperature,
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("❌ OpenRouter API error:", response.status, errorBody);
        throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return {
        content: data.choices?.[0]?.message?.content || "",
        model: data.model || openRouterModel,
        provider: "openrouter",
        tokensUsed: data.usage?.total_tokens,
    };
}

// ---- ChatGPT (OAuth) ----

async function callChatGPT(
    systemPrompt: string,
    userMessage: string,
    temperature: number
): Promise<{ content: string; model: string; provider: string; tokensUsed?: number }> {
    if (!isAuthenticated()) {
        throw new Error("Não autenticado com ChatGPT. Faça login primeiro.");
    }

    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
    const tmpFileIn = path.join(os.tmpdir(), `codex-in-${randomUUID()}.txt`);
    const tmpFileOut = path.join(os.tmpdir(), `codex-out-${randomUUID()}.txt`);

    await fs.writeFile(tmpFileIn, fullPrompt, "utf-8");

    return new Promise((resolve, reject) => {
        // Executa o Codex CLI rodando o prompt via stdin com permissão read-only
        const cmd = `cmd.exe /c type "${tmpFileIn}" | codex exec --full-auto -s read-only -o "${tmpFileOut}" -`;

        exec(cmd, async (error, stdout, stderr) => {
            try {
                // Remove o temp file de entrada
                await fs.unlink(tmpFileIn).catch(() => { });

                if (error) {
                    await fs.unlink(tmpFileOut).catch(() => { });
                    console.error("❌ Codex CLI error:", error.message);
                    return reject(new Error(`Falha no Codex CLI. Verifique se tem internet e se está autenticado no terminal.`));
                }

                let content = "";
                try {
                    content = await fs.readFile(tmpFileOut, "utf-8");
                    await fs.unlink(tmpFileOut).catch(() => { });
                } catch (readErr) {
                    console.error("❌ Falha ao ler saída do Codex CLI:", readErr);
                    return reject(new Error("Não foi possível ler a resposta do Codex CLI."));
                }

                resolve({
                    content: content.trim(),
                    model: "gpt-5-codex-cli",
                    provider: "chatgpt",
                });
            } catch (err: any) {
                reject(err);
            }
        });
    });
}

// ---- Public API ----

/**
 * Generate a formatted ultrasound report from raw dictation.
 * Automatically uses the active provider (OpenRouter or ChatGPT).
 */
export async function generateReport(
    request: GenerateReportRequest
): Promise<GenerateReportResponse> {
    let userMessage = request.rawInput;
    if (request.additionalContext) {
        userMessage += `\n\nContexto adicional: ${request.additionalContext}`;
    }

    try {
        // Inject current date into prompt template
        const now = new Date();
        const dataAtual = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
        const promptWithDate = MASTER_PROMPT.replace("{{DATA_ATUAL}}", dataAtual);

        const result = await callAI(promptWithDate, userMessage, 0.3);

        // Clean up thinking tags if model returns them
        let report = result.content.trim();
        report = report.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        // Extract exam type from the report title (first line)
        let examType = "Auto-Detectado";
        const titleMatch = report.match(/LAUDO DE ULTRASSONOGRAFIA\s+(D[AEIO]S?\s+)?(.+)/i);
        if (titleMatch) {
            // Clean up: "DO ABDÔMEN TOTAL" → "Abdômen Total"
            let raw = titleMatch[2].trim();
            // Title case
            examType = "USG " + raw
                .toLowerCase()
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
        }

        return {
            report,
            examType,
            model: result.model,
            provider: result.provider,
            tokensUsed: result.tokensUsed,
        };
    } catch (error: any) {
        console.error("❌ AI generation error:", error.message);
        throw new Error(`Erro ao gerar laudo: ${error.message}`);
    }
}

/**
 * Refine/edit a previously generated report based on additional instructions.
 */
export async function refineReport(
    currentReport: string,
    instructions: string
): Promise<GenerateReportResponse> {
    const userMessage = `${MASTER_PROMPT}

Você recebeu um laudo já gerado. O médico deseja fazer ajustes. Aplique APENAS as modificações solicitadas, mantendo todo o restante do laudo intacto.

LAUDO ATUAL:
${currentReport}

MODIFICAÇÕES SOLICITADAS PELO MÉDICO:
${instructions}

Gere o laudo completo atualizado com as modificações aplicadas.`;

    try {
        const result = await callAI(
            "Você é um assistente especialista em radiologia. Aplique as modificações solicitadas ao laudo, mantendo o restante intacto.",
            userMessage,
            0.2
        );

        let report = result.content.trim();
        report = report.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        return {
            report,
            examType: "Auto-Detectado",
            model: result.model,
            provider: result.provider,
            tokensUsed: result.tokensUsed,
        };
    } catch (error: any) {
        console.error("❌ AI refinement error:", error.message);
        throw new Error(`Erro ao refinar laudo: ${error.message}`);
    }
}
