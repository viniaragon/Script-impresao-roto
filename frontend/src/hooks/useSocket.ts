'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SERVER_URL, Agent, PrintJob, JOB_STATUS } from '@/lib/constants';

export function useSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [jobs, setJobs] = useState<PrintJob[]>([]);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Conecta ao servidor WebSocket
        const socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor:', socket.id);
            setIsConnected(true);

            // Busca lista inicial de agentes via HTTP
            fetchAgents();
        });

        socket.on('disconnect', () => {
            console.log('❌ Desconectado do servidor');
            setIsConnected(false);
        });

        // Evento: Novo agente conectado
        socket.on('dashboard:agent-connected', (data: { agentId: string; name: string; printers: Agent['printers'] }) => {
            console.log('📡 Novo agente conectado:', data.name);
            setAgents(prev => {
                // Remove se já existir e adiciona atualizado
                const filtered = prev.filter(a => a.id !== data.agentId);
                return [...filtered, {
                    id: data.agentId,
                    name: data.name,
                    printers: data.printers || [],
                    connectedAt: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                }];
            });
        });

        // Evento: Agente desconectado
        socket.on('dashboard:agent-disconnected', (data: { agentId: string }) => {
            console.log('📴 Agente desconectado:', data.agentId);
            setAgents(prev => prev.filter(a => a.id !== data.agentId));
        });

        // Evento: Impressoras atualizadas
        socket.on('dashboard:printers-updated', (data: { agentId: string; printers: Agent['printers'] }) => {
            setAgents(prev => prev.map(agent =>
                agent.id === data.agentId
                    ? { ...agent, printers: data.printers, lastSeen: new Date().toISOString() }
                    : agent
            ));
        });

        // Evento: Status do job de impressão
        socket.on('dashboard:job-status', (data: { jobId: string; status: string; message?: string }) => {
            console.log('📊 Job status:', data);
            setJobs(prev => prev.map(job =>
                job.jobId === data.jobId
                    ? { ...job, status: data.status as PrintJob['status'], message: data.message }
                    : job
            ));
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // Busca lista de agentes via HTTP
    const fetchAgents = async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/agents`);
            const data = await response.json();
            setAgents(data);
        } catch (error) {
            console.error('Erro ao buscar agentes:', error);
        }
    };

    // Envia job de impressão
    const sendPrintJob = useCallback((agentId: string, printerId: string, fileUrl: string, fileName: string) => {
        if (!socketRef.current) return null;

        const jobId = `job-${Date.now()}`;

        // Adiciona job à lista local
        const newJob: PrintJob = {
            jobId,
            agentId,
            printerId,
            fileName,
            status: JOB_STATUS.PENDING,
            createdAt: new Date(),
        };
        setJobs(prev => [...prev, newJob]);

        // Envia para o servidor
        socketRef.current.emit('print:send-job', {
            agentId,
            printerId,
            fileUrl,
            fileName,
        });

        return jobId;
    }, []);

    // Remove job concluído/erro da lista
    const clearJob = useCallback((jobId: string) => {
        setJobs(prev => prev.filter(j => j.jobId !== jobId));
    }, []);

    return {
        isConnected,
        agents,
        jobs,
        sendPrintJob,
        clearJob,
        refreshAgents: fetchAgents,
    };
}
