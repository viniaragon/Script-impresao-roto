'use client';

import { CheckCircle, XCircle, Loader2, Download, Printer } from 'lucide-react';
import { PrintJob, JOB_STATUS } from '@/lib/constants';

interface JobStatusProps {
    jobs: PrintJob[];
    onClearJob: (jobId: string) => void;
}

const statusConfig = {
    [JOB_STATUS.PENDING]: {
        icon: Loader2,
        color: 'text-gray-400',
        bg: 'bg-gray-500/10',
        label: 'Aguardando...',
        animate: true,
    },
    [JOB_STATUS.DOWNLOADING]: {
        icon: Download,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        label: 'Baixando...',
        animate: true,
    },
    [JOB_STATUS.PRINTING]: {
        icon: Printer,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        label: 'Imprimindo...',
        animate: true,
    },
    [JOB_STATUS.COMPLETED]: {
        icon: CheckCircle,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        label: 'Concluído!',
        animate: false,
    },
    [JOB_STATUS.ERROR]: {
        icon: XCircle,
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        label: 'Erro',
        animate: false,
    },
};

export function JobStatus({ jobs, onClearJob }: JobStatusProps) {
    if (jobs.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-sm">
            {jobs.map((job) => {
                const config = statusConfig[job.status] || statusConfig[JOB_STATUS.PENDING];
                const Icon = config.icon;

                return (
                    <div
                        key={job.jobId}
                        className={`
              ${config.bg} backdrop-blur-sm border border-gray-700/50 rounded-xl p-4
              shadow-xl animate-in slide-in-from-right duration-300
            `}
                    >
                        <div className="flex items-start gap-3">
                            <Icon
                                className={`w-5 h-5 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white text-sm truncate">{job.fileName}</p>
                                <p className={`text-xs ${config.color}`}>
                                    {job.message || config.label}
                                </p>
                            </div>
                            {(job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.ERROR) && (
                                <button
                                    onClick={() => onClearJob(job.jobId)}
                                    className="text-gray-500 hover:text-white transition-colors"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
