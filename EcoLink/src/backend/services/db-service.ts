// ============================================================
// EcoLink - Database Service
// Manages SQLite database for reports history using bun:sqlite
// ============================================================

import { Database } from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const DB_PATH = path.join(import.meta.dir, "../../../data/ecolink.db");

let db: Database;

export interface Report {
    id: string;
    exam_type: string;
    patient_name: string | null;
    raw_input: string;
    generated_report: string;
    edited_report: string | null;
    created_at: string;
    updated_at: string;
}

export function initDatabase(): Database {
    db = new Database(DB_PATH, { create: true });

    // Enable WAL mode for better concurrent performance
    db.run("PRAGMA journal_mode=WAL");

    db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      exam_type TEXT NOT NULL,
      patient_name TEXT,
      raw_input TEXT NOT NULL,
      generated_report TEXT NOT NULL,
      edited_report TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

    console.log("✅ Database initialized at", DB_PATH);
    return db;
}

export function getDb(): Database {
    if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
    return db;
}

// --- Report CRUD ---

export function createReport(data: {
    exam_type: string;
    patient_name?: string;
    raw_input: string;
    generated_report: string;
}): Report {
    const id = uuidv4();
    const now = new Date().toISOString();

    getDb().run(
        `INSERT INTO reports (id, exam_type, patient_name, raw_input, generated_report, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.exam_type, data.patient_name || null, data.raw_input, data.generated_report, now, now]
    );

    return getReportById(id)!;
}

export function getReportById(id: string): Report | null {
    return getDb().query("SELECT * FROM reports WHERE id = ?").get(id) as Report | null;
}

export function listReports(limit = 50, offset = 0): Report[] {
    return getDb()
        .query("SELECT * FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .all(limit, offset) as Report[];
}

export function updateReport(id: string, data: { edited_report?: string; patient_name?: string }): Report | null {
    const now = new Date().toISOString();

    if (data.edited_report !== undefined) {
        getDb().run("UPDATE reports SET edited_report = ?, updated_at = ? WHERE id = ?", [data.edited_report, now, id]);
    }
    if (data.patient_name !== undefined) {
        getDb().run("UPDATE reports SET patient_name = ?, updated_at = ? WHERE id = ?", [data.patient_name, now, id]);
    }

    return getReportById(id);
}

export function deleteReport(id: string): boolean {
    const result = getDb().run("DELETE FROM reports WHERE id = ?", [id]);
    return result.changes > 0;
}

export function deleteAllReports(): number {
    const result = getDb().run("DELETE FROM reports");
    return result.changes;
}
