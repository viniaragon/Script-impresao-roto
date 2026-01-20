/**
 * EchoLink Backend - Servidor WebSocket
 * 
 * Responsável por:
 * - Gerenciar conexões dos agentes (PCs clientes)
 * - Manter registro de impressoras disponíveis
 * - Encaminhar jobs de impressão para os agentes
 */

// Força uso de IPv4 para evitar problemas com IPv6
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { uploadFile, db, deleteFile } = require('./firebase');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io com CORS
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST']
    }
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

// Tipos de arquivo permitidos para impressão
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Configuração do Multer para upload de arquivos em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // Limite de 50MB
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de arquivo não suportado. Formatos aceitos: PDF, JPG, PNG, GIF, BMP, TXT, DOC, DOCX, XLS, XLSX'), false);
        }
    }
});

// Endpoint de upload de arquivo
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        console.log(`📤 Upload recebido: ${req.file.originalname} (${req.file.size} bytes)`);

        // Faz upload para o Firebase Storage e salva metadados no Firestore
        const result = await uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            req.file.size
        );

        console.log(`✅ Upload concluído: ${result.url.substring(0, 80)}...`);
        if (result.metadata) {
            console.log(`   📋 Metadados: ${result.metadata.examType} | ${result.metadata.patientName}`);
        }

        res.json({
            success: true,
            url: result.url,
            fileId: result.fileId,
            fileName: req.file.originalname,
            size: req.file.size,
            metadata: result.metadata
        });
    } catch (error) {
        console.error('❌ Erro no upload:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para listar arquivos com filtros opcionais
app.get('/api/files', async (req, res) => {
    try {
        const { examType, patientName, startDate, endDate, limit = 50 } = req.query;

        let query = db.collection('files').orderBy('uploadedAt', 'desc');

        // Aplica filtros
        if (examType) {
            query = query.where('examType', '==', examType.toUpperCase());
        }

        // Nota: Firestore não suporta busca parcial, então patientName precisa ser exato
        if (patientName) {
            query = query.where('patientName', '==', patientName);
        }

        if (startDate) {
            query = query.where('examDate', '>=', new Date(startDate));
        }

        if (endDate) {
            query = query.where('examDate', '<=', new Date(endDate));
        }

        query = query.limit(parseInt(limit));

        const snapshot = await query.get();
        const files = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            uploadedAt: doc.data().uploadedAt?.toDate?.()?.toISOString() || null,
            examDate: doc.data().examDate?.toDate?.()?.toISOString() || null
        }));

        res.json(files);
    } catch (error) {
        console.error('❌ Erro ao listar arquivos:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obter detalhes de um arquivo
app.get('/api/files/:id', async (req, res) => {
    try {
        const doc = await db.collection('files').doc(req.params.id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        const data = doc.data();
        res.json({
            id: doc.id,
            ...data,
            uploadedAt: data.uploadedAt?.toDate?.()?.toISOString() || null,
            examDate: data.examDate?.toDate?.()?.toISOString() || null
        });
    } catch (error) {
        console.error('❌ Erro ao obter arquivo:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para deletar um arquivo
app.delete('/api/files/:id', async (req, res) => {
    try {
        const docRef = db.collection('files').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        const data = doc.data();

        // Remove do Storage
        if (data.storagePath) {
            await deleteFile(data.storagePath);
        }

        // Remove do Firestore
        await docRef.delete();

        console.log(`🗑️ Arquivo deletado: ${data.originalFileName}`);
        res.json({ success: true, message: 'Arquivo deletado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar arquivo:', error.message);
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
        const { jobId, agentId, printerId, fileUrl, fileName } = data;

        // Debug: lista agentes conectados
        console.log(`📥 Job recebido - agentId: ${agentId}, printerId: ${printerId}`);
        console.log(`   Agentes conectados: ${connectedAgents.size}`);
        connectedAgents.forEach((info, id) => {
            console.log(`   - ${id} (socket: ${info.socketId})`);
        });

        const agent = connectedAgents.get(agentId);
        if (agent) {
            // Encontra o socket do agente e envia o job (usa o jobId do frontend)
            io.to(agent.socketId).emit('print:new-job', {
                jobId: jobId || `job-${Date.now()}`, // Usa o ID do frontend ou gera um novo
                printerId,
                fileUrl,
                fileName
            });

            console.log(`📄 Job enviado para ${agentId}: ${fileName}`);
        } else {
            console.log(`❌ Agente não encontrado: ${agentId}`);
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
