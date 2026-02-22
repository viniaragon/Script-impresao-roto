import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { generateDocx } from "./doc-service.js";
import { generatePdf } from "./pdf-service.js";
import { getSettings } from "./settings-service.js";

/**
 * Auto-export service: saves .docx and .pdf to pre-configured folders.
 * Folders are read from settings.json (UI) or .env fallback.
 */

interface ExportResult {
    docxPath: string | null;
    pdfPath: string | null;
}

function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function sanitizeFileName(name: string): string {
    return name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents for clean filenames
        .replace(/[^a-zA-Z0-9\s\-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .substring(0, 80)
        .toUpperCase();
}

/**
 * Extract exam type abbreviation from the report text.
 * Looks for keywords in the first 300 chars (usually the title line).
 */
function extractExamAbbrev(reportText: string): string {
    const header = reportText.substring(0, 400).toUpperCase();

    const abbreviations: [RegExp, string][] = [
        [/ABD[OÔ]MEN|ABDOMINAL/, "ABDOM"],
        [/TIREOIDE|TIRE[OÓ]IDE/, "TIREO"],
        [/MAMA|MAM[AÁ]RIA/, "MAMA"],
        [/TRANSVAGINAL/, "TRANSV"],
        [/OBST[EÉ]TRIC/, "OBST"],
        [/PR[OÓ]STATA|PROST[AÁ]TIC/, "PROST"],
        [/PARTES MOLES/, "PM"],
        [/VIAS URIN[AÁ]RIAS|RENAL/, "VU"],
        [/P[EÉ]LVIC/, "PELV"],
        [/CERVICAL|PESCO[CÇ]O/, "CERV"],
        [/TESTICULAR|ESCROTAL/, "TEST"],
        [/INGUINAL/, "ING"],
        [/AXILAR/, "AXIL"],
        [/TORAX|TOR[AÁ]CIC/, "TORAX"],
    ];

    for (const [pattern, abbrev] of abbreviations) {
        if (pattern.test(header)) return abbrev;
    }

    return "USG"; // Fallback genérico
}

/**
 * Build filename following the format:
 * NOME-PACIENTE-ABREV-DD-MM-YYYY-HH-MM.ext
 * Example: JOAO-ALMEIDA-DE-JEDUS-ABDOM-20-02-2026-17-08.docx
 */
function buildFileName(patientName: string | null, reportText: string, extension: string): string {
    const date = new Date();
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");

    // If no patientName from UI, try to extract from the report text
    let resolvedName = patientName;
    if (!resolvedName) {
        const match = reportText.match(/Paciente:\s*(.+)/i);
        if (match && match[1].trim() && !match[1].trim().toLowerCase().includes("não informado")) {
            resolvedName = match[1].trim();
        }
    }

    const pName = resolvedName ? sanitizeFileName(resolvedName) : "PACIENTE";
    const examAbbrev = extractExamAbbrev(reportText);

    return `${pName}-${examAbbrev}-${dd}-${mm}-${yyyy}-${hh}-${min}.${extension}`;
}

export async function autoExport(
    reportId: string,
    patientName: string | null,
    reportText: string,
    examType: string
): Promise<ExportResult> {
    const result: ExportResult = { docxPath: null, pdfPath: null };

    // Get configured paths from settings (UI-configurable) with .env fallback
    const settings = getSettings();
    const docxBasePath = settings.exportDocxPath || process.env.EXPORT_DOCX_PATH;
    const pdfBasePath = settings.exportPdfPath || process.env.EXPORT_PDF_PATH;

    if (!docxBasePath && !pdfBasePath) {
        console.warn("⚠️  Pastas de exportação não configuradas. Use ⚙️ Configurações para definir.");
        return result;
    }

    // Create date-based subfolder for organization
    const date = new Date();
    const dateFolder = date.toISOString().split("T")[0]; // YYYY-MM-DD

    try {
        // --- DOCX ---
        if (docxBasePath) {
            const docxDir = join(docxBasePath, dateFolder);
            ensureDir(docxDir);

            const docxFileName = buildFileName(patientName, reportText, "docx");
            const docxFullPath = join(docxDir, docxFileName);

            const docxBuffer = await generateDocx(patientName, reportText, examType);
            writeFileSync(docxFullPath, docxBuffer);

            result.docxPath = docxFullPath;
            console.log(`📄 DOCX salvo em: ${docxFullPath}`);
        }

        // --- PDF ---
        if (pdfBasePath) {
            const pdfDir = join(pdfBasePath, dateFolder);
            ensureDir(pdfDir);

            const pdfFileName = buildFileName(patientName, reportText, "pdf");
            const pdfFullPath = join(pdfDir, pdfFileName);

            const pdfBuffer = await generatePdf(patientName, reportText, examType);
            writeFileSync(pdfFullPath, pdfBuffer);

            result.pdfPath = pdfFullPath;
            console.log(`📑 PDF salvo em: ${pdfFullPath}`);
        }
    } catch (error: any) {
        console.error("❌ Erro na auto-exportação:", error.message);
    }

    return result;
}
