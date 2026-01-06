/**
 * EchoLink Backend - Servidor WebSocket
 * 
 * Responsável por:
 * - Gerenciar conexões dos agentes (PCs clientes)
 * - Manter registro de impressoras disponíveis
 * - Encaminhar jobs de impressão para os agentes
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { uploadFile } = require('./firebase');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io com CORS e timeouts ajustados
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Configurações para conexão mais estável
    pingTimeout: 60000,         // 60s antes de considerar desconectado
    pingInterval: 25000,        // Ping a cada 25s
    upgradeTimeout: 30000,      // 30s para upgrade para WebSocket
    transports: ['websocket', 'polling'],  // Prioriza WebSocket
    allowUpgrades: true
});

// Middleware
app.use(cors());
app.use(express.json());

// Armazenamento em memória dos agentes conectados
// Em produção, considere usar Redis para persistência
const connectedAgents = new Map();

// Rota de health check (Passo 1.1)
app.get('/health', (req, res) => {
    res.send('OK');
});

// Rota de status detalhado
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'EchoLink Server',
        version: '1.0.0',
        agents: connectedAgents.size,
        timestamp: new Date().toISOString()
    });
});

// Rota para listar agentes conectados (para o dashboard)
app.get('/api/agents', (req, res) => {
    const agents = [];
    connectedAgents.forEach((data, id) => {
        agents.push({
            id,
            name: data.name,
            printers: data.printers,
            connectedAt: data.connectedAt,
            lastSeen: data.lastSeen
        });
    });
    res.json(agents);
});

// Configuração do Multer para upload de arquivos em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // Limite de 50MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos'), false);
        }
    }
});

// Endpoint de upload de PDF
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        console.log(`📤 Upload recebido: ${req.file.originalname} (${req.file.size} bytes)`);

        // Faz upload para o Firebase Storage
        const fileUrl = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
        );

        console.log(`✅ Upload concluído: ${fileUrl.substring(0, 80)}...`);

        res.json({
            success: true,
            url: fileUrl,
            fileName: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('❌ Erro no upload:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Gerenciamento de conexões WebSocket
io.on('connection', (socket) => {
    console.log(`📡 Nova conexão: ${socket.id}`);

    // Evento: Agente se registra
    socket.on('agent:register', (data) => {
        const { agentId, name, printers } = data;

        connectedAgents.set(agentId, {
            socketId: socket.id,
            name: name || `PC-${agentId.slice(0, 8)}`,
            printers: printers || [],
            connectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        });

        console.log(`✅ Agente registrado: ${agentId} (${name})`);
        console.log(`   Impressoras: ${printers?.length || 0}`);

        // Notifica o dashboard sobre novo agente
        io.emit('dashboard:agent-connected', {
            agentId,
            name,
            printers
        });

        // Confirma registro para o agente
        socket.emit('agent:registered', { success: true, agentId });
    });

    // Evento: Agente atualiza lista de impressoras
    socket.on('agent:update-printers', (data) => {
        const { agentId, printers } = data;

        if (connectedAgents.has(agentId)) {
            const agent = connectedAgents.get(agentId);
            agent.printers = printers;
            agent.lastSeen = new Date().toISOString();

            console.log(`🖨️ Impressoras atualizadas: ${agentId}`);

            // Notifica o dashboard
            io.emit('dashboard:printers-updated', { agentId, printers });
        }
    });

    // Evento: Dashboard envia job de impressão
    socket.on('print:send-job', (data) => {
        const { agentId, printerId, fileUrl, fileName } = data;

        const agent = connectedAgents.get(agentId);
        if (agent) {
            // Encontra o socket do agente e envia o job
            io.to(agent.socketId).emit('print:new-job', {
                jobId: `job-${Date.now()}`,
                printerId,
                fileUrl,
                fileName
            });

            console.log(`📄 Job enviado para ${agentId}: ${fileName}`);
        } else {
            socket.emit('print:error', { message: 'Agente não encontrado' });
        }
    });

    // Evento: Agente reporta status do job
    socket.on('print:job-status', (data) => {
        const { jobId, status, message } = data;
        console.log(`📊 Job ${jobId}: ${status} - ${message}`);

        // Notifica o dashboard
        io.emit('dashboard:job-status', data);
    });

    // Evento: Desconexão
    socket.on('disconnect', () => {
        // Encontra e remove o agente desconectado
        connectedAgents.forEach((data, agentId) => {
            if (data.socketId === socket.id) {
                connectedAgents.delete(agentId);
                console.log(`❌ Agente desconectado: ${agentId}`);

                // Notifica o dashboard
                io.emit('dashboard:agent-disconnected', { agentId });
            }
        });
    });
});

// Heartbeat - Verifica agentes inativos a cada 30 segundos
setInterval(() => {
    const now = Date.now();
    connectedAgents.forEach((data, agentId) => {
        const lastSeen = new Date(data.lastSeen).getTime();
        // Remove agentes inativos há mais de 2 minutos
        if (now - lastSeen > 120000) {
            connectedAgents.delete(agentId);
            console.log(`⏰ Agente removido por inatividade: ${agentId}`);
            io.emit('dashboard:agent-disconnected', { agentId });
        }
    });
}, 30000);

// Iniciar servidor
const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('══════════════════════════════════════════');
    console.log('   🖨️  EchoLink Server iniciado!');
    console.log(`   📡 Porta: ${PORT}`);
    console.log(`   🌐 URL: http://localhost:${PORT}`);
    console.log('══════════════════════════════════════════');
    console.log('');
});
