import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Settings service: manages application settings in a JSON file.
 * Settings are stored in data/settings.json alongside the database.
 */

const SETTINGS_FILE = join(process.cwd(), "data", "settings.json");

interface AppSettings {
    exportDocxPath: string;
    exportPdfPath: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    exportDocxPath: process.env.EXPORT_DOCX_PATH || "",
    exportPdfPath: process.env.EXPORT_PDF_PATH || "",
};

export function getSettings(): AppSettings {
    try {
        if (existsSync(SETTINGS_FILE)) {
            const raw = readFileSync(SETTINGS_FILE, "utf-8");
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.error("Erro ao ler settings.json:", e);
    }
    return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = getSettings();
    const updated = { ...current, ...settings };

    writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    console.log("⚙️  Configurações salvas:", updated);
    return updated;
}
