'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText, X, Image, FileSpreadsheet, File } from 'lucide-react';

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

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.gif,.bmp,.txt,.doc,.docx,.xls,.xlsx';

// Retorna o ícone apropriado baseado no tipo de arquivo
function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
    return FileText;
}

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    selectedFile: File | null;
    onClear: () => void;
}

export function FileUpload({ onFileSelect, selectedFile, onClear }: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file && ALLOWED_MIME_TYPES.includes(file.type)) {
            onFileSelect(file);
        } else {
            alert('Formato não suportado. Aceitos: PDF, JPG, PNG, GIF, BMP, TXT, DOC, DOCX, XLS, XLSX');
        }
    }, [onFileSelect]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (ALLOWED_MIME_TYPES.includes(file.type)) {
                onFileSelect(file);
            } else {
                alert('Formato não suportado. Aceitos: PDF, JPG, PNG, GIF, BMP, TXT, DOC, DOCX, XLS, XLSX');
            }
        }
    }, [onFileSelect]);

    if (selectedFile) {
        return (
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-5">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-lg">
                        {(() => {
                            const IconComponent = getFileIcon(selectedFile.type);
                            return <IconComponent className="w-6 h-6 text-emerald-400" />;
                        })()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{selectedFile.name}</p>
                        <p className="text-sm text-gray-400">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                    <button
                        onClick={onClear}
                        className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400 hover:text-white" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
        relative bg-gray-800/50 backdrop-blur-sm border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
        ${isDragging
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/70'}
      `}
        >
            <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-full ${isDragging ? 'bg-emerald-500/20' : 'bg-gray-700/50'}`}>
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-emerald-400' : 'text-gray-400'}`} />
                </div>
                <div>
                    <p className="font-medium text-white">
                        {isDragging ? 'Solte o arquivo aqui' : 'Arraste um arquivo ou clique para selecionar'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">PDF, Imagens, Word, Excel e TXT</p>
                </div>
            </div>
        </div>
    );
}
