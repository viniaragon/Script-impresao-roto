'use client';

import { Printer as PrinterIcon, Monitor, Check } from 'lucide-react';
import { Agent, Printer } from '@/lib/constants';

interface AgentCardProps {
    agent: Agent;
    selectedPrinter: { agentId: string; printerId: string } | null;
    onSelectPrinter: (agentId: string, printer: Printer) => void;
}

export function AgentCard({ agent, selectedPrinter, onSelectPrinter }: AgentCardProps) {
    const isSelected = selectedPrinter?.agentId === agent.id;

    return (
        <div className={`
      bg-gray-800/50 backdrop-blur-sm border rounded-xl p-5 transition-all
      ${isSelected ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' : 'border-gray-700/50 hover:border-gray-600'}
    `}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Monitor className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <p className="text-xs text-gray-400">
                        Online desde {new Date(agent.connectedAt).toLocaleTimeString('pt-BR')}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs text-emerald-400">Online</span>
                </div>
            </div>

            {/* Printers */}
            <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Impressoras ({agent.printers.length})
                </p>

                {agent.printers.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Nenhuma impressora encontrada</p>
                ) : (
                    agent.printers.map((printer) => {
                        const isPrinterSelected = selectedPrinter?.agentId === agent.id && selectedPrinter?.printerId === printer.id;

                        return (
                            <button
                                key={printer.id}
                                onClick={() => onSelectPrinter(agent.id, printer)}
                                className={`
                  w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left
                  ${isPrinterSelected
                                        ? 'bg-emerald-500/20 border border-emerald-500/50'
                                        : 'bg-gray-700/30 hover:bg-gray-700/50 border border-transparent'}
                `}
                            >
                                <PrinterIcon className={`w-4 h-4 ${isPrinterSelected ? 'text-emerald-400' : 'text-gray-400'}`} />
                                <span className={`flex-1 text-sm ${isPrinterSelected ? 'text-emerald-300' : 'text-gray-300'}`}>
                                    {printer.name}
                                </span>
                                {isPrinterSelected && (
                                    <Check className="w-4 h-4 text-emerald-400" />
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
