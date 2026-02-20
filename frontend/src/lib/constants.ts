// Constantes do projeto EchoLink

// URL do servidor WebSocket (Railway em produção)
export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://script-impresao-roto.zeabur.app';

// Status de jobs possíveis
export const JOB_STATUS = {
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    PRINTING: 'printing',
    COMPLETED: 'completed',
    ERROR: 'error',
} as const;

export type JobStatus = typeof JOB_STATUS[keyof typeof JOB_STATUS];

// Tipos de dados
export interface Printer {
    id: string;
    name: string;
    driver?: string;
    status?: string;
}

export interface Agent {
    id: string;
    name: string;
    printers: Printer[];
    connectedAt: string;
    lastSeen: string;
}

export interface PrintJob {
    jobId: string;
    agentId: string;
    printerId: string;
    fileName: string;
    status: JobStatus;
    message?: string;
    createdAt: Date;
}
