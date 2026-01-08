import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import config from "./config.json";

const execAsync = promisify(exec);

// ==================== TYPES ====================
interface Agent {
    id: string;
    name: string;
    status: "online" | "offline" | "busy";
    printers: string[];
    last_seen: string;
}

interface Job {
    id: string;
    agent_id: string;
    file_name: string;
    file_path: string;
    printer: string;
    status: "pending" | "printing" | "done" | "error";
    error_message?: string;
}

// ==================== SUPABASE CLIENT ====================
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

let currentAgentId: string | null = null;
let jobsChannel: RealtimeChannel | null = null;

// ==================== PRINTER DETECTION ====================
async function detectPrinters(): Promise<string[]> {
    try {
        const { stdout } = await execAsync(
            'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"'
        );
        const printers = stdout
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        console.log(`🖨️  Impressoras detectadas: ${printers.length}`);
        printers.forEach((p) => console.log(`   - ${p}`));
        return printers;
    } catch (error) {
        console.error("❌ Erro ao detectar impressoras:", error);
        return [];
    }
}

// ==================== AGENT REGISTRATION ====================
async function registerAgent(): Promise<string | null> {
    const printers = await detectPrinters();

    // Check if agent already exists
    const { data: existingAgent } = await supabase
        .from("agents")
        .select("id")
        .eq("name", config.agentName)
        .single();

    if (existingAgent) {
        // Update existing agent
        const { error } = await supabase
            .from("agents")
            .update({
                status: "online",
                printers,
                last_seen: new Date().toISOString(),
            })
            .eq("id", existingAgent.id);

        if (error) {
            console.error("❌ Erro ao atualizar agente:", error);
            return null;
        }

        console.log(`✅ Agente reconectado: ${config.agentName} (${existingAgent.id})`);
        return existingAgent.id;
    }

    // Create new agent
    const { data: newAgent, error } = await supabase
        .from("agents")
        .insert({
            name: config.agentName,
            status: "online",
            printers,
        })
        .select("id")
        .single();

    if (error || !newAgent) {
        console.error("❌ Erro ao registrar agente:", error);
        return null;
    }

    console.log(`✅ Novo agente registrado: ${config.agentName} (${newAgent.id})`);
    return newAgent.id;
}

// ==================== PRINT JOB HANDLING ====================
async function downloadFile(filePath: string, fileName: string): Promise<string> {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const localPath = path.join(tempDir, fileName);

    console.log(`📥 Tentando baixar: ${filePath} do bucket 'print-files'`);

    // Download from Supabase Storage
    const { data, error } = await supabase.storage
        .from("print-files")
        .download(filePath);

    if (error) {
        console.error("❌ Erro completo do Storage:", JSON.stringify(error, null, 2));
        throw new Error(`Erro ao baixar arquivo: ${error.message || JSON.stringify(error)}`);
    }

    if (!data) {
        throw new Error("Arquivo não encontrado no Storage");
    }

    // Save to local file
    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(localPath, buffer);

    console.log(`📥 Arquivo baixado: ${localPath}`);
    return localPath;
}

async function printFile(localPath: string, printer: string): Promise<void> {
    const printerArg = printer ? `"${printer}"` : "";

    // Using PowerShell to print PDF
    const command = `powershell -Command "Start-Process -FilePath '${localPath}' -Verb Print ${printerArg ? `-ArgumentList ${printerArg}` : ''}"`;

    try {
        await execAsync(command);
        console.log(`🖨️  Arquivo enviado para impressão: ${path.basename(localPath)}`);
    } catch (error) {
        throw new Error(`Erro ao imprimir: ${error}`);
    }
}

async function processJob(job: Job): Promise<void> {
    console.log(`\n📋 Novo job recebido: ${job.file_name}`);

    try {
        // Update status to printing
        await supabase
            .from("jobs")
            .update({ status: "printing" })
            .eq("id", job.id);

        // Download file
        const localPath = await downloadFile(job.file_path, job.file_name);

        // Print file
        const printer = job.printer || config.defaultPrinter;
        await printFile(localPath, printer);

        // Update status to done
        await supabase
            .from("jobs")
            .update({
                status: "done",
                printed_at: new Date().toISOString(),
            })
            .eq("id", job.id);

        // Cleanup temp file
        try {
            fs.unlinkSync(localPath);
        } catch { }

        console.log(`✅ Job concluído: ${job.file_name}`);
    } catch (error: any) {
        console.error(`❌ Erro no job: ${error.message}`);

        await supabase
            .from("jobs")
            .update({
                status: "error",
                error_message: error.message,
            })
            .eq("id", job.id);
    }
}

// ==================== REALTIME SUBSCRIPTION ====================
function subscribeToJobs(agentId: string): void {
    console.log("🔌 Conectando ao Supabase Realtime...");

    jobsChannel = supabase
        .channel("jobs-channel")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "jobs",
                filter: `agent_id=eq.${agentId}`,
            },
            (payload) => {
                const job = payload.new as Job;
                if (job.status === "pending") {
                    processJob(job);
                }
            }
        )
        .subscribe((status) => {
            if (status === "SUBSCRIBED") {
                console.log("✅ Conectado ao Realtime! Aguardando jobs...\n");
            }
        });
}

// ==================== HEARTBEAT ====================
function startHeartbeat(agentId: string): void {
    setInterval(async () => {
        await supabase
            .from("agents")
            .update({ last_seen: new Date().toISOString() })
            .eq("id", agentId);
    }, 30000); // Every 30 seconds
}

// ==================== GRACEFUL SHUTDOWN ====================
async function shutdown(): Promise<void> {
    console.log("\n🛑 Desligando agente...");

    if (currentAgentId) {
        await supabase
            .from("agents")
            .update({ status: "offline" })
            .eq("id", currentAgentId);
    }

    if (jobsChannel) {
        await supabase.removeChannel(jobsChannel);
    }

    console.log("👋 Agente desconectado. Até logo!");
    process.exit(0);
}

// Handle CTRL+C
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ==================== MAIN ====================
async function main(): Promise<void> {
    console.log("╔════════════════════════════════════════╗");
    console.log("║     🖨️  EchoLink Agent v1.0.0          ║");
    console.log("╚════════════════════════════════════════╝\n");

    console.log(`📡 Conectando a: ${config.supabaseUrl}`);
    console.log(`🏷️  Nome do agente: ${config.agentName}\n`);

    // Register agent
    currentAgentId = await registerAgent();
    if (!currentAgentId) {
        console.error("❌ Falha ao registrar agente. Encerrando.");
        process.exit(1);
    }

    // Subscribe to jobs
    subscribeToJobs(currentAgentId);

    // Start heartbeat
    startHeartbeat(currentAgentId);

    // Check for pending jobs
    const { data: pendingJobs } = await supabase
        .from("jobs")
        .select("*")
        .eq("agent_id", currentAgentId)
        .eq("status", "pending");

    if (pendingJobs && pendingJobs.length > 0) {
        console.log(`📋 ${pendingJobs.length} job(s) pendente(s) encontrado(s)`);
        for (const job of pendingJobs) {
            await processJob(job);
        }
    }
}

main().catch(console.error);