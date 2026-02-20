// ============================================================
// EcoLink - API Routes
// Hono routes for report generation and management
// ============================================================

import { Hono } from "hono";
import { generateReport, refineReport } from "../services/ai-service.js";
import { transcribeAudio } from "../services/voice-service.js";
import { generateDocx } from "../services/doc-service.js";
import { createReport, listReports, getReportById, updateReport, deleteReport } from "../services/db-service.js";

export const api = new Hono();

// ---- Generate Report (CORE endpoint) ----

api.post("/generate", async (c) => {
    try {
        const body = await c.req.json();
        const { rawInput, additionalContext, patientName } = body;

        if (!rawInput || !rawInput.trim()) {
            return c.json({ error: "O campo 'rawInput' (ditado) é obrigatório." }, 400);
        }

        // 1. Call AI to generate the report
        const aiResult = await generateReport({
            rawInput: rawInput.trim(),
            additionalContext,
        });

        // 2. Save to database
        const savedReport = createReport({
            exam_type: aiResult.examType,
            patient_name: patientName || null,
            raw_input: rawInput.trim(),
            generated_report: aiResult.report,
        });

        return c.json({
            success: true,
            report: savedReport,
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
