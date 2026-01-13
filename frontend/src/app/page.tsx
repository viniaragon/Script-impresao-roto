'use client';

import { useState, useCallback, useEffect } from 'react';
import { Printer, Wifi, WifiOff, RefreshCw, Send } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { AgentCard } from '@/components/AgentCard';
import { FileUpload } from '@/components/FileUpload';
import { JobStatus } from '@/components/JobStatus';
import { Printer as PrinterType } from '@/lib/constants';

export default function Home() {
  const { isConnected, agents, jobs, sendPrintJob, clearJob, refreshAgents } = useSocket();
  const [selectedPrinter, setSelectedPrinter] = useState<{ agentId: string; printerId: string; printerName: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('selectedPrinter');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Salvar no sessionStorage quando a impressora mudar
  useEffect(() => {
    if (selectedPrinter) {
      sessionStorage.setItem('selectedPrinter', JSON.stringify(selectedPrinter));
    }
  }, [selectedPrinter]);

  const handleSelectPrinter = useCallback((agentId: string, printer: PrinterType) => {
    setSelectedPrinter({
      agentId,
      printerId: printer.id,
      printerName: printer.name,
    });
  }, []);

  const handlePrint = useCallback(async () => {
    if (!selectedPrinter || !selectedFile) return;

    setIsSending(true);

    try {
      // Upload do PDF para Firebase Storage via backend
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL || 'https://echolink-backend-production.up.railway.app'}/api/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'Erro no upload');
      }

      const { url: fileUrl, fileName } = await uploadResponse.json();
      console.log('✅ Upload concluído:', fileUrl.substring(0, 80) + '...');

      // Envia job de impressão com a URL do Firebase
      sendPrintJob(
        selectedPrinter.agentId,
        selectedPrinter.printerId,
        fileUrl,
        fileName
      );

      // Limpa apenas o arquivo após envio (mantém a impressora selecionada)
      setSelectedFile(null);
    } catch (error) {
      console.error('❌ Erro ao enviar job:', error);
      alert(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsSending(false);
    }
  }, [selectedPrinter, selectedFile, sendPrintJob]);

  const canPrint = selectedPrinter && selectedFile && !isSending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-sm bg-gray-900/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
                <Printer className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">EchoLink</h1>
                <p className="text-xs text-gray-400">Sistema de Impressão Remota</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={refreshAgents}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Atualizar lista"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <div className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
                ${isConnected
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'}
              `}>
                {isConnected ? (
                  <>
                    <Wifi className="w-4 h-4" />
                    <span>Conectado</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span>Desconectado</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Agents List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Agentes Conectados
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({agents.length})
                </span>
              </h2>
            </div>

            {agents.length === 0 ? (
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-12 text-center">
                <div className="p-4 bg-gray-700/30 rounded-full w-fit mx-auto mb-4">
                  <WifiOff className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-300 mb-2">
                  Nenhum agente conectado
                </h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Execute o EchoLink Agent em um PC Windows para conectar e ver as impressoras disponíveis.
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selectedPrinter={selectedPrinter}
                    onSelectPrinter={handleSelectPrinter}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Upload & Print */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Enviar Impressão</h2>

            {/* Selected Printer Info */}
            {selectedPrinter && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <p className="text-xs text-emerald-400 uppercase tracking-wide mb-1">
                  Impressora Selecionada
                </p>
                <p className="text-white font-medium">{selectedPrinter.printerName}</p>
              </div>
            )}

            {/* File Upload */}
            <FileUpload
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              onClear={() => setSelectedFile(null)}
            />

            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={!canPrint}
              className={`
                w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all
                ${canPrint
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
              `}
            >
              <Send className="w-5 h-5" />
              {isSending ? 'Enviando...' : 'Enviar para Impressão'}
            </button>

            {!selectedPrinter && !selectedFile && (
              <p className="text-xs text-gray-500 text-center">
                Selecione uma impressora e um arquivo PDF para imprimir
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Job Status Toasts */}
      <JobStatus jobs={jobs} onClearJob={clearJob} />
    </div>
  );
}
