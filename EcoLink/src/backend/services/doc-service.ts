import { Document, Paragraph, TextRun, Packer, AlignmentType, HeadingLevel, convertInchesToTwip } from "docx";

/**
 * Service to generate formatted Word (.docx) documents from medical reports.
 */
export async function generateDocx(
    patientName: string | null,
    reportText: string,
    examType: string
): Promise<Buffer> {
    // 1. Process the report text into paragraphs
    const lines = reportText.split("\n");
    const paragraphs: Paragraph[] = [];

    // Header structure (removed "LAUDO MÉDICO" as requested)
    // Reserve 8 blank lines at the top for clinic letterhead
    for (let i = 0; i < 8; i++) {
        paragraphs.push(new Paragraph({ text: "", spacing: { after: 0 } }));
    }

    let isSectionTitle = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            // Adds empty lines for spacing between major sections
            paragraphs.push(new Paragraph({ text: "", spacing: { after: 120 } }));
            continue;
        }

        // Detect if line is a major title (LAUDO DE ..., etc.) or bold section (Conclusão:)
        isSectionTitle =
            trimmed.toUpperCase() === trimmed && trimmed.length > 5 ||
            trimmed.startsWith("Conclusão:");

        // Detect basic markdown bold (e.g., **Fígado:**)
        const parts = trimmed.split(/(\*\*.*?\*\*)/g);

        const textRuns: TextRun[] = parts.map((part) => {
            if (part.startsWith("**") && part.endsWith("**")) {
                return new TextRun({
                    text: part.replace(/\*\*/g, ""),
                    bold: true,
                    font: "Arial",
                    size: 24, // 12pt (docx uses half-points)
                });
            }
            return new TextRun({
                text: part,
                bold: isSectionTitle,
                font: "Arial",
                size: 24, // 12pt
            });
        });

        paragraphs.push(
            new Paragraph({
                children: textRuns,
                alignment: isSectionTitle && trimmed.startsWith("LAUDO DE") ? AlignmentType.CENTER : AlignmentType.LEFT,
                // Removed line: 360 to enforce single spacing (1.0). 
                // Reduced after spacing for normal lines.
                spacing: { after: isSectionTitle ? 200 : 0 },
            })
        );
    }

    // 2. Create Document with standard medical formatting
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(1),
                            right: convertInchesToTwip(1.18), // 3cm
                            bottom: convertInchesToTwip(1),
                            left: convertInchesToTwip(1.18), // 3cm
                        },
                    },
                },
                children: paragraphs,
            },
        ],
    });

    // 3. Generate and return the Buffer
    const buffer = await Packer.toBuffer(doc);
    return buffer as Buffer;
}
