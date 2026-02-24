// ============================================================
// EcoLink - API Routes
// Hono routes for report generation and management
// ============================================================

import { Hono } from "hono";
import { generateReport, refineReport, isGatewayOnline, getGatewayInfo } from "../services/ai-service.js";
import { transcribeAudio } from "../services/voice-service.js";
import { generateDocx } from "../services/doc-service.js";
import { autoExport } from "../services/export-service.js";
import { getSettings, saveSettings } from "../services/settings-service.js";
import { createReport, listReports, getReportById, updateReport, deleteReport, deleteAllReports } from "../services/db-service.js";
import { validateApiKey } from "../services/apikey-service.js";

export const api = new Hono();

// ---- API Key Middleware ----
// If an X-API-Key header is present, validate it.
// If no key is provided, allow access (for local dev without keys).
api.use("*", async (c, next) => {
    const apiKey = c.req.header("X-API-Key");
    if (apiKey) {
        const keyRecord = validateApiKey(apiKey);
        if (!keyRecord) {
            return c.json({ error: "API Key inválida ou revogada." }, 401);
        }
    }
    await next();
});

// ---- Gateway Status ----
api.get("/gateway/status", (c) => {
    return c.json(getGatewayInfo());
});

// ---- Generate Report (CORE endpoint) ----

api.post("/generate", async (c) => {
    try {
        const body = await c.req.json();
        const { rawInput, additionalContext, patientName } = body;

        if (!rawInput || !rawInput.trim()) {
            return c.json({ error: "O campo 'rawInput' (ditado) é obrigatório." }, 400);
        }

        // 1. Call AI to generate the report
        // Inject patient name into the prompt if provided via UI field
        let aiInput = rawInput.trim();
        if (patientName) {
            aiInput = `Paciente: ${patientName}\n${aiInput}`;
        }

        const aiResult = await generateReport({
            rawInput: aiInput,
            additionalContext,
        });

        // 2. Save to database
        const savedReport = createReport({
            exam_type: aiResult.examType,
            patient_name: patientName || null,
            raw_input: rawInput.trim(),
            generated_report: aiResult.report,
        });

        // 3. Auto-export .docx and .pdf to configured folders
        const exportResult = await autoExport(
            savedReport.id,
            patientName || null,
            aiResult.report,
            aiResult.examType
        );

        return c.json({
            success: true,
            report: savedReport,
            exports: exportResult,
            ai: {
                model: aiResult.model,
                provider: aiResult.provider,
                tokensUsed: aiResult.tokensUsed,
            },
        });
    } catch (error: any) {
        console.error("Generate error:", error);
        return c.json({ error: error.message }, 500);
    }
});

// ---- Voice Transcription ----

api.post("/transcribe", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body["audio"] as File;

        if (!file) {
            return c.json({ error: "Nenhum arquivo de áudio enviado" }, 400);
        }

        const text = await transcribeAudio(file);

        return c.json({ success: true, text });
    } catch (error: any) {
        console.error("Transcription error:", error);
        return c.json({ error: error.message || "Erro na transcrição" }, 500);
    }
});

// ---- Voice Flow (Full Pipeline: transcribe → generate → save → export) ----

api.post("/voice-flow", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body["audio"] as File;
        const patientName = (body["patientName"] as string) || null;

        if (!file) {
            return c.json({ error: "Nenhum arquivo de áudio enviado" }, 400);
        }

        // Step 1: Transcribe audio
        console.log("🎤 [voice-flow] Transcrevendo áudio...");
        const transcribedText = await transcribeAudio(file);
        console.log(`📝 [voice-flow] Transcrição: "${transcribedText.substring(0, 80)}..."`);

        if (!transcribedText.trim()) {
            return c.json({ error: "Transcrição retornou vazia. Tente novamente." }, 400);
        }

        // Step 2: Generate report via AI
        // Inject patient name into the prompt if provided via UI field
        let aiInput = transcribedText.trim();
        if (patientName) {
            aiInput = `Paciente: ${patientName}\n${aiInput}`;
        }

        console.log("🤖 [voice-flow] Gerando laudo...");
        const aiResult = await generateReport({
            rawInput: aiInput,
        });

        // Step 3: Save to database
        const savedReport = createReport({
            exam_type: aiResult.examType,
            patient_name: patientName || undefined,
            raw_input: transcribedText.trim(),
            generated_report: aiResult.report,
        });
        console.log(`💾 [voice-flow] Laudo salvo no banco: ${savedReport.id}`);

        // Step 4: Auto-export .docx and .pdf
        console.log("📁 [voice-flow] Exportando arquivos...");
        const exportResult = await autoExport(
            savedReport.id,
            patientName,
            aiResult.report,
            aiResult.examType
        );

        return c.json({
            success: true,
            report: savedReport,
            transcription: transcribedText,
            exports: exportResult,
            ai: {
                model: aiResult.model,
                provider: aiResult.provider,
                tokensUsed: aiResult.tokensUsed,
            },
        });
    } catch (error: any) {
        console.error("❌ Voice-flow error:", error);
        return c.json({ error: error.message || "Erro no fluxo de voz" }, 500);
    }
});

// ---- Refine Report ----

api.post("/refine/:id", async (c) => {
    try {
        const id = c.req.param("id");
        const body = await c.req.json();
        const { instructions } = body;

        if (!instructions?.trim()) {
            return c.json({ error: "O campo 'instructions' é obrigatório." }, 400);
        }

        const existing = getReportById(id);
        if (!existing) {
            return c.json({ error: "Laudo não encontrado." }, 404);
        }

        const currentText = existing.edited_report || existing.generated_report;

        const aiResult = await refineReport(currentText, instructions.trim());

        // Update the edited_report field
        const updated = updateReport(id, { edited_report: aiResult.report });

        return c.json({
            success: true,
            report: updated,
            ai: {
                model: aiResult.model,
                provider: aiResult.provider,
                tokensUsed: aiResult.tokensUsed,
            },
        });
    } catch (error: any) {
        console.error("Refine error:", error);
        return c.json({ error: error.message }, 500);
    }
});

// ---- Report CRUD ----

api.get("/reports", (c) => {
    const limit = Number(c.req.query("limit") || 50);
    const offset = Number(c.req.query("offset") || 0);
    const reports = listReports(limit, offset);
    return c.json({ reports });
});

api.get("/reports/:id", (c) => {
    const report = getReportById(c.req.param("id"));
    if (!report) return c.json({ error: "Laudo não encontrado." }, 404);
    return c.json({ report });
});

api.patch("/reports/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const updated = updateReport(id, body);
    if (!updated) return c.json({ error: "Laudo não encontrado." }, 404);
    return c.json({ report: updated });
});

api.delete("/reports/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteReport(id);
    if (!deleted) return c.json({ error: "Laudo não encontrado." }, 404);
    return c.json({ success: true });
});

api.delete("/reports", (c) => {
    const count = deleteAllReports();
    console.log(`🗑️ ${count} laudos removidos do histórico.`);
    return c.json({ success: true, deletedCount: count });
});

// ---- Export Word Document ----

api.get("/reports/:id/download-docx", async (c) => {
    try {
        const id = c.req.param("id");
        const report = getReportById(id);

        if (!report) {
            return c.json({ error: "Laudo não encontrado." }, 404);
        }

        const reportText = report.edited_report || report.generated_report;

        // Use default file name or patient name
        const pName = (report.patient_name || "").replace(/[^a-zA-Z0-9]/g, "_");
        const fileName = pName ? `Laudo_${pName}.docx` : `Laudo_${id}.docx`;

        const buffer = await generateDocx(report.patient_name, reportText, report.exam_type);

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error("DOCX Export error:", error);
        return c.json({ error: "Erro ao gerar arquivo Word." }, 500);
    }
});

// ---- Settings ----

api.get("/settings", (c) => {
    const settings = getSettings();
    return c.json({ settings });
});

api.post("/settings", async (c) => {
    try {
        const body = await c.req.json();
        const updated = saveSettings(body);
        return c.json({ success: true, settings: updated });
    } catch (error: any) {
        console.error("Settings error:", error);
        return c.json({ error: error.message }, 500);
    }
});
