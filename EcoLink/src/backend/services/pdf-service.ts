import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Service to generate formatted PDF documents from medical reports.
 * Uses pdf-lib for lightweight, dependency-free PDF generation.
 */
export async function generatePdf(
    patientName: string | null,
    reportText: string,
    examType: string
): Promise<Buffer> {
    const doc = await PDFDocument.create();

    // Embed standard fonts
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 11;
    const titleFontSize = 13;
    const margin = 72; // 1 inch = 72 points
    const pageWidth = 595.28; // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = fontSize * 1.4;
    const titleLineHeight = titleFontSize * 1.6;

    let page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    function addNewPageIfNeeded(requiredSpace: number) {
        if (y - requiredSpace < margin) {
            page = doc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }
    }

    // Word-wrap helper: splits text to fit within maxWidth
    function wrapText(text: string, font: any, size: number): string[] {
        const words = text.split(" ");
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = font.widthOfTextAtSize(testLine, size);

            if (testWidth > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    // Reserve 8 blank lines at the top for clinic letterhead
    y -= lineHeight * 8;

    // Process report text line by line
    const lines = reportText.split("\n");

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            // Blank line → small vertical gap
            y -= lineHeight * 0.6;
            continue;
        }

        // Detect major title (ALL CAPS with length > 5)
        const isTitle =
            trimmed.toUpperCase() === trimmed && trimmed.length > 5;

        // Detect bold markdown segments (**text**)
        const segments = trimmed.split(/(\*\*.*?\*\*)/g);
        const hasMarkdownBold = segments.some(
            (s) => s.startsWith("**") && s.endsWith("**")
        );

        if (isTitle) {
            // Centered title
            const wrapped = wrapText(trimmed, fontBold, titleFontSize);
            for (const wLine of wrapped) {
                addNewPageIfNeeded(titleLineHeight);
                const textWidth = fontBold.widthOfTextAtSize(wLine, titleFontSize);
                page.drawText(wLine, {
                    x: (pageWidth - textWidth) / 2,
                    y,
                    size: titleFontSize,
                    font: fontBold,
                    color: rgb(0, 0, 0),
                });
                y -= titleLineHeight;
            }
            y -= 4; // Extra spacing after title
        } else if (hasMarkdownBold) {
            // Line with mixed bold/normal (e.g., **Fígado:** description...)
            // We need to render segments inline

            // First, compute all segments and their properties
            const renderSegments: { text: string; font: any; }[] = [];
            for (const seg of segments) {
                if (!seg) continue;
                if (seg.startsWith("**") && seg.endsWith("**")) {
                    renderSegments.push({
                        text: seg.replace(/\*\*/g, ""),
                        font: fontBold,
                    });
                } else {
                    renderSegments.push({ text: seg, font: fontRegular });
                }
            }

            // Build the full plain text for wrapping purposes
            const fullText = renderSegments.map((s) => s.text).join("");
            const wrapped = wrapText(fullText, fontRegular, fontSize);

            // For each wrapped line, draw it
            for (const wLine of wrapped) {
                addNewPageIfNeeded(lineHeight);

                // Find what portion of each segment falls in this wrapped line
                let xPos = margin;
                let remaining = wLine;

                for (const seg of renderSegments) {
                    if (!remaining) break;
                    if (!seg.text) continue;

                    // How much of this segment appears in the remaining line
                    const overlap = remaining.startsWith(seg.text)
                        ? seg.text
                        : remaining.substring(0, seg.text.length);

                    if (remaining.startsWith(overlap) && overlap) {
                        page.drawText(overlap, {
                            x: xPos,
                            y,
                            size: fontSize,
                            font: seg.font,
                            color: rgb(0, 0, 0),
                        });
                        xPos += seg.font.widthOfTextAtSize(overlap, fontSize);
                        remaining = remaining.substring(overlap.length);
                        seg.text = seg.text.substring(overlap.length);
                    }
                }

                y -= lineHeight;
            }
        } else {
            // Normal paragraph (may start with "Conclusão:", "Descrição do exame:", etc.)
            const isSectionHeader =
                trimmed.startsWith("Conclusão:") ||
                trimmed.startsWith("Descrição do exame:");
            const font = isSectionHeader ? fontBold : fontRegular;
            const wrapped = wrapText(trimmed, font, fontSize);

            for (const wLine of wrapped) {
                addNewPageIfNeeded(lineHeight);
                page.drawText(wLine, {
                    x: margin,
                    y,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                });
                y -= lineHeight;
            }
        }
    }

    // Serialize
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}
