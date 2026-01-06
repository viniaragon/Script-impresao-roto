/**
 * EchoLink Agent - Cliente de Impressão
 * 
 * Responsável por:
 * - Conectar ao servidor via WebSocket
 * - Listar impressoras locais do Windows
 * - Receber e executar jobs de impressão
 */

const { io } = require('socket.io-client');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Detecta se está rodando como executável PKG
const isPkg = typeof process.pkg !== 'undefined';

// Diretório base: se for PKG usa a pasta do executável, senão usa __dirname
const BASE_DIR = isPkg
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..');

// Configurações - caminhos externos ao snapshot
const CONFIG_PATH = path.join(BASE_DIR, 'echolink-config.json');
const TEMP_DIR = path.join(os.tmpdir(), 'echolink-temp');
const TOOLS_DIR = path.join(BASE_DIR, 'tools');
const SERVER_URL = process.env.SERVER_URL || 'https://echolink-backend-production.up.railway.app';

// Garante que a pasta temp existe (no sistema, não no snapshot)
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Carrega ou cria o ID único do agente
 */
function loadOrCreateAgentId() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (config.agentId) {
                console.log(`📋 ID do agente carregado: ${config.agentId}`);
                return config;
            }
        }
    } catch (error) {
        console.log('⚠️ Erro ao ler config, criando novo...');
    }

    // Cria novo ID
    const config = {
        agentId: uuidv4(),
        name: `PC-${require('os').hostname()}`,
        createdAt: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`🆕 Novo agente criado: ${config.agentId}`);
    return config;
}

/**
 * Lista impressoras do Windows via PowerShell
 * Filtra impressoras virtuais e offline
 */
function listPrinters() {
    return new Promise((resolve, reject) => {
        // Lista todas as impressoras com status Normal
        // Remove apenas Fax, OneNote e XPS (que nunca são úteis)
        // Mantém PDF para testes
        const psCommand = `
      Get-Printer | Where-Object { 
        $_.PrinterStatus -eq 'Normal' -and 
        $_.Name -notlike '*Fax*' -and 
        $_.Name -notlike '*OneNote*' -and 
        $_.Name -notlike '*XPS*'
      } | Select-Object Name, PrinterStatus, DriverName, PortName | ConvertTo-Json
    `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Erro ao listar impressoras:', error.message);
                resolve([]);
                return;
            }

            try {
                let printers = JSON.parse(stdout || '[]');
                // Garante que é sempre um array
                if (!Array.isArray(printers)) {
                    printers = printers ? [printers] : [];
                }
                resolve(printers);
            } catch (parseError) {
                console.error('❌ Erro ao parsear impressoras:', parseError.message);
                resolve([]);
            }
        });
    });
}

/**
 * Baixa um arquivo PDF
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);

        protocol.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Segue redirecionamento
                downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(destPath);
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

/**
 * Imprime um arquivo PDF usando PDFtoPrinter ou SumatraPDF
 */
function printPDF(filePath, printerName) {
    return new Promise((resolve, reject) => {
        // Opção 1: Usando PDFtoPrinter (precisa estar na pasta tools junto ao .exe)
        const pdfToPrinter = path.join(TOOLS_DIR, 'PDFtoPrinter.exe');

        // Opção 2: Usando comando nativo do Windows (menos confiável)
        let command;

        if (fs.existsSync(pdfToPrinter)) {
            command = `"${pdfToPrinter}" "${filePath}" "${printerName}"`;
        } else {
            // Fallback: usa o comando Start-Process do PowerShell
            command = `powershell -Command "Start-Process -FilePath '${filePath}' -Verb PrintTo -ArgumentList '${printerName}' -Wait"`;
        }

        console.log(`🖨️ Executando: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Erro ao imprimir: ${error.message}`));
                return;
            }
            resolve();
        });
    });
}

/**
 * Função principal
 */
async function main() {
    console.log('');
    console.log('══════════════════════════════════════════');
    console.log('   🖨️  EchoLink Agent iniciando...');
    console.log('══════════════════════════════════════════');
    console.log('');

    // Carrega configuração do agente
    const config = loadOrCreateAgentId();

    // Lista impressoras
    console.log('🔍 Buscando impressoras...');
    const printers = await listPrinters();
    console.log(`   Encontradas: ${printers.length} impressora(s)`);
    printers.forEach(p => console.log(`   - ${p.Name}`));

    // Conecta ao servidor
    console.log(`\n📡 Conectando ao servidor: ${SERVER_URL}`);

    const socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Prioriza WebSocket para conexão mais estável
        transports: ['websocket', 'polling'],
        timeout: 60000  // 60s timeout
    });

    // Evento: Conectado
    socket.on('connect', () => {
        console.log('✅ Conectado ao servidor!');

        // Registra o agente
        socket.emit('agent:register', {
            agentId: config.agentId,
            name: config.name,
            printers: printers.map(p => ({
                id: p.Name.replace(/\s+/g, '_'),
                name: p.Name,
                driver: p.DriverName,
                status: p.PrinterStatus
            }))
        });
    });

    // Evento: Registro confirmado
    socket.on('agent:registered', (data) => {
        console.log('📝 Registro confirmado pelo servidor');
    });

    // Evento: Novo job de impressão
    socket.on('print:new-job', async (job) => {
        console.log(`\n📄 Novo job recebido: ${job.fileName}`);
        console.log(`   Impressora: ${job.printerId}`);
        console.log(`   URL: ${job.fileUrl}`);

        try {
            // Reporta status: downloading
            socket.emit('print:job-status', {
                jobId: job.jobId,
                status: 'downloading',
                message: 'Baixando arquivo...'
            });

            // Baixa o arquivo
            const tempFile = path.join(TEMP_DIR, `${job.jobId}.pdf`);
            await downloadFile(job.fileUrl, tempFile);
            console.log('   ✓ Download concluído');

            // Reporta status: printing
            socket.emit('print:job-status', {
                jobId: job.jobId,
                status: 'printing',
                message: 'Enviando para impressora...'
            });

            // Imprime
            const printerName = job.printerId.replace(/_/g, ' ');
            await printPDF(tempFile, printerName);
            console.log('   ✓ Enviado para impressora');

            // Limpa arquivo temporário
            fs.unlinkSync(tempFile);

            // Reporta status: completed
            socket.emit('print:job-status', {
                jobId: job.jobId,
                status: 'completed',
                message: 'Impressão concluída!'
            });

            console.log('   ✓ Job concluído com sucesso!');

        } catch (error) {
            console.error(`   ✗ Erro: ${error.message}`);

            socket.emit('print:job-status', {
                jobId: job.jobId,
                status: 'error',
                message: error.message
            });
        }
    });

    // Evento: Desconectado
    socket.on('disconnect', (reason) => {
        console.log(`❌ Desconectado: ${reason}`);
        console.log('   Tentando reconectar...');
    });

    // Evento: Erro de conexão
    socket.on('connect_error', (error) => {
        console.log(`⚠️ Erro de conexão: ${error.message}`);
    });

    // Evento: Reconectado
    socket.on('reconnect', (attemptNumber) => {
        console.log(`🔄 Reconectado após ${attemptNumber} tentativa(s)`);
    });

    // Heartbeat: Ping a cada 30 segundos para manter conexão ativa
    setInterval(() => {
        if (socket.connected) {
            socket.emit('agent:heartbeat', { agentId: config.agentId });
        }
    }, 30 * 1000);

    // Atualiza lista de impressoras periodicamente (a cada 1 minuto)
    setInterval(async () => {
        if (socket.connected) {
            const updatedPrinters = await listPrinters();
            socket.emit('agent:update-printers', {
                agentId: config.agentId,
                printers: updatedPrinters.map(p => ({
                    id: p.Name.replace(/\s+/g, '_'),
                    name: p.Name,
                    driver: p.DriverName,
                    status: p.PrinterStatus
                }))
            });
        }
    }, 60 * 1000);

    // Mantém o processo rodando
    console.log('\n⏳ Aguardando jobs de impressão...\n');
}

// Inicia o agente
main().catch(console.error);
