import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';

interface Source {
  id: string;
  title: string;
  snippet?: string;
  type?: string;
}

interface SourcePanelProps {
  sources: Source[];
  onSelectSource?: (source: Source) => void;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({ sources, onSelectSource }) => {
  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
        <FileText className="w-12 h-12 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium italic">No citations retrieved for this query.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-full pr-2 custom-scrollbar">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-600" />
        References & Evidence
      </h3>
      <div className="grid gap-3">
        {sources.map((source) => (
          <div 
            key={source.id} 
            onClick={() => onSelectSource?.(source)}
            className="group p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full uppercase tracking-wider">
                {source.type || 'Paper'}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight mb-2 group-hover:text-indigo-600 transition-colors">
              {source.title}
            </h4>
            {source.snippet && (
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed border-l-2 border-slate-100 pl-3">
                "{source.snippet}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
