import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { uploadPdf, type UploadResponse } from '../services/api';

interface UploadPanelProps {
  onUploadSuccess?: (response: UploadResponse) => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface UploadedFile {
  name: string;
  size: number;
  response?: UploadResponse;
  error?: string;
}

export const UploadPanel: React.FC<UploadPanelProps> = ({ onUploadSuccess }) => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadedFile({ name: file.name, size: file.size, error: 'Only PDF files are supported.' });
      setUploadState('error');
      return;
    }

    setUploadedFile({ name: file.name, size: file.size });
    setUploadState('uploading');

    try {
      const response = await uploadPdf(file);
      setUploadedFile({ name: file.name, size: file.size, response });
      setUploadState('success');
      onUploadSuccess?.(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadedFile({ name: file.name, size: file.size, error: message });
      setUploadState('error');
    }
  }, [onUploadSuccess]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const reset = () => {
    setUploadState('idle');
    setUploadedFile(null);
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[11px] font-mono tracking-widest text-[#9ca3af] uppercase flex items-center gap-2 mb-1">
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          Document Ingestion
        </h2>
        <p className="text-[11px] font-mono text-[#4b5563]">
          Upload PDF files to index into the RAG pipeline and Neo4j graph.
        </p>
      </div>

      {/* Drop zone */}
      <AnimatePresence mode="wait">
        {uploadState === 'idle' && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all',
                isDragging
                  ? 'border-indigo-500/70 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.08)]'
                  : 'border-[#2b2d35] bg-[#0c0d10] hover:border-indigo-500/40 hover:bg-[#151619]'
              )}
            >
              <div className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center border transition-all',
                isDragging
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-[#2b2d35] bg-[#151619]'
              )}>
                <Upload className={cn('w-5 h-5 transition-colors', isDragging ? 'text-indigo-400' : 'text-[#6b7280]')} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-[13px] font-mono text-[#e5e7eb]">
                  {isDragging ? 'Drop to upload' : 'Drop PDF here'}
                </p>
                <p className="text-[11px] font-mono text-[#4b5563]">
                  or <span className="text-indigo-400 underline underline-offset-2">browse files</span>
                </p>
              </div>
              <span className="text-[9px] font-mono text-[#374151] uppercase tracking-widest border border-[#1e2128] px-2 py-0.5 rounded">
                .pdf only
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload PDF file"
            />
          </motion.div>
        )}

        {uploadState === 'uploading' && uploadedFile && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-[#2b2d35] rounded-lg p-6 bg-[#0c0d10] space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-[#151619] border border-[#2b2d35] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[#6b7280]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-mono text-[#e5e7eb] truncate">{uploadedFile.name}</p>
                <p className="text-[10px] font-mono text-[#4b5563]">{formatBytes(uploadedFile.size)}</p>
              </div>
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-[#1e2128] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: '85%' }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              />
            </div>
            <p className="text-[10px] font-mono text-[#6b7280] text-center">
              Uploading and indexing into pipeline…
            </p>
          </motion.div>
        )}

        {uploadState === 'success' && uploadedFile?.response && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-emerald-900/40 rounded-lg p-5 bg-emerald-950/20 space-y-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-mono text-emerald-400 mb-1">Upload successful</p>
                <p className="text-[11px] font-mono text-[#9ca3af] truncate">{uploadedFile.response.filename}</p>
              </div>
              <button
                onClick={reset}
                className="text-[#4b5563] hover:text-[#9ca3af] transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metadata */}
            <div className="bg-[#0c0d10] border border-[#1e2128] rounded p-3 font-mono text-[10px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#4b5563]">stored_as</span>
                <span className="text-[#9ca3af] truncate max-w-[180px]">{uploadedFile.response.stored_filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4b5563]">path</span>
                <span className="text-[#9ca3af] truncate max-w-[180px]">{uploadedFile.response.stored_path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4b5563]">content_type</span>
                <span className="text-[#9ca3af]">{uploadedFile.response.content_type ?? 'application/pdf'}</span>
              </div>
            </div>

            <p className="text-[10px] font-mono text-[#6b7280] border-l border-emerald-900/40 pl-2">
              RAG index will refresh on the next query.
            </p>

            <button
              onClick={reset}
              className="w-full py-2 text-[11px] font-mono uppercase tracking-wider text-[#9ca3af] border border-[#2b2d35] rounded hover:border-indigo-500/40 hover:text-indigo-400 transition-all"
            >
              Upload another
            </button>
          </motion.div>
        )}

        {uploadState === 'error' && uploadedFile && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-rose-900/40 rounded-lg p-5 bg-rose-950/20 space-y-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-mono text-rose-400 mb-1">Upload failed</p>
                <p className="text-[11px] font-mono text-[#9ca3af] truncate">{uploadedFile.name}</p>
              </div>
              <button
                onClick={reset}
                className="text-[#4b5563] hover:text-[#9ca3af] transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-[#0c0d10] border border-rose-900/30 rounded p-3 font-mono text-[10px] text-rose-400/80">
              {uploadedFile.error}
            </div>

            <button
              onClick={reset}
              className="w-full py-2 text-[11px] font-mono uppercase tracking-wider text-[#9ca3af] border border-[#2b2d35] rounded hover:border-rose-500/40 hover:text-rose-400 transition-all"
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info block */}
      {uploadState === 'idle' && (
        <div className="mt-6 space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-[#374151]">Pipeline notes</p>
          <ul className="space-y-1.5 font-mono text-[10px] text-[#4b5563]">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500/60 mt-0.5">›</span>
              Only <span className="text-[#6b7280]">.pdf</span> files are accepted
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500/60 mt-0.5">›</span>
              File is stored and ingested into Neo4j graph
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500/60 mt-0.5">›</span>
              RAG index refreshes on the next query
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
