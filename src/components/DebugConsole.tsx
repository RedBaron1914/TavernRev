import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger, LogEntry, LogCategory } from "../services/Logger";
import { Copy, Trash2, X, Terminal, Brain, ShieldAlert, Database, RefreshCw } from "lucide-react";

export const DebugConsole = ({ onClose }: { onClose: () => void }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogCategory>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return logger.subscribe(setLogs);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, filter]);

  const filteredLogs = logs.filter(l => filter === 'all' || l.category === filter);

  const copyLogs = () => {
      const text = filteredLogs.map(l => `[${l.timestamp}] [${l.category.toUpperCase()}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(text);
      alert("Filtered logs copied to clipboard");
  };

  const fetchPrompt = async () => {
      try {
          const prompt = await invoke<string>("get_last_prompt");
          if (prompt && prompt.trim() !== "") {
              logger.addLog('info', [prompt]);
          } else {
              alert("No prompt found in backend memory. Try generating a message first.");
          }
      } catch (e) {
          console.error(e);
      }
  };

  const tabs: {id: LogCategory, label: string, icon: any}[] = [
    { id: 'all', label: 'All', icon: Terminal },
    { id: 'ai', label: 'AI Prompt', icon: Brain },
    { id: 'error', label: 'Errors', icon: ShieldAlert },
    { id: 'database', label: 'DB', icon: Database },
    { id: 'system', label: 'System', icon: Terminal },
  ];

  return (
    <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col font-mono text-xs text-white p-4 animate-in fade-in duration-200">
      <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-4 bg-black/50 p-2 rounded shrink-0">
        <h3 className="font-bold text-base text-green-400 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"/>
            System Console
        </h3>
        <div className="flex gap-2">
          <button onClick={fetchPrompt} className="p-2 hover:bg-white/10 rounded text-emerald-400 flex items-center gap-1" title="Fetch Latest Prompt"><RefreshCw size={18}/></button>
          <button onClick={copyLogs} className="p-2 hover:bg-white/10 rounded text-blue-400" title="Copy Filtered"><Copy size={18}/></button>
          <button onClick={() => logger.clear()} className="p-2 hover:bg-white/10 rounded text-red-400" title="Clear All"><Trash2 size={18}/></button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded text-gray-400"><X size={20}/></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto custom-scrollbar pb-2 shrink-0">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all shrink-0 ${filter === tab.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-gray-900 border-white/5 text-gray-400 hover:bg-white/5'}`}
            >
                <tab.icon size={14} />
                <span className="font-bold uppercase tracking-wider text-[10px]">{tab.label}</span>
            </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 select-text p-2 custom-scrollbar border border-white/5 rounded-xl bg-black/30">
        {filteredLogs.length === 0 && <div className="text-gray-600 italic text-center mt-10">No logs found for this filter...</div>}
        {filteredLogs.map((log, i) => (
          <div key={i} className={`break-words whitespace-pre-wrap border-b border-white/5 pb-1 mb-1 ` + (
              log.level === 'error' ? 'text-red-400 bg-red-900/10 p-1 rounded' : 
              log.level === 'warn' ? 'text-yellow-400' : 
              'text-gray-300'
          )}>
            <span className="text-gray-500 opacity-50 select-none text-[9px]">[{log.timestamp}]</span>{' '}
            <span className={`font-bold text-[9px] uppercase px-1 rounded mr-1 ` + (
                log.category === 'ai' ? 'bg-emerald-900/30 text-emerald-400' :
                log.category === 'database' ? 'bg-amber-900/30 text-amber-400' :
                log.category === 'error' ? 'bg-red-900/30 text-red-400' :
                'bg-blue-900/30 text-blue-400'
            )}>{log.category}</span>
            {' '}{log.message}
          </div>
        ))}
      </div>
    </div>
  );
};
