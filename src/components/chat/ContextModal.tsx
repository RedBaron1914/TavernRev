import { useState, useEffect } from "react";
import { X, ArrowDownToLine } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export interface ContextStats {
  total_messages: number;
  excluded_messages: number;
  overflow_trimmed: number;
  tokens_used: number;
  context_size: number;
}

interface ContextModalProps {
  chatId: number;
  profileName: string | null;
  onTrim: () => void;
  onClose: () => void;
}

export function ContextModal({ chatId, profileName, onTrim, onClose }: ContextModalProps) {
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [autoTrimEnabled, setAutoTrimEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, enabled] = await Promise.all([
          invoke<ContextStats>("get_context_stats", {
            chatId,
            profileName: profileName || "Default",
          }),
          invoke<boolean>("get_auto_trim_enabled", { chatId }),
        ]);
        setStats(s);
        setAutoTrimEnabled(enabled);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [chatId, profileName]);

  const toggleAutoTrim = async () => {
    const next = !autoTrimEnabled;
    try {
      await invoke("set_auto_trim_enabled", { chatId, enabled: next });
      setAutoTrimEnabled(next);
    } catch (e) {
      console.error(e);
    }
  };

  const contextSize = stats?.context_size ?? 0;
  const tokensUsed = stats?.tokens_used ?? 0;
  const contextPercent =
    contextSize > 0 ? Math.min(100, Math.round((tokensUsed / contextSize) * 100)) : 0;

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/50">
          <div className="flex items-center gap-2">
            <ArrowDownToLine size={16} className="text-gray-400" />
            <span className="font-bold text-sm">Context Manager</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="text-gray-500 text-sm text-center py-4">Loading...</div>
          ) : stats ? (
            <>
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Tokens</span>
                  <span>{tokensUsed} / {contextSize}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      contextPercent > 95
                        ? "bg-red-500"
                        : contextPercent > 80
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${contextPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-right mt-0.5 text-gray-500">{contextPercent}%</div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                  <span className="text-gray-400">Total messages</span>
                  <span className="text-white font-mono font-bold">{stats.total_messages}</span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                  <span className="text-gray-400">Hidden from prompt</span>
                  <span className="text-amber-400 font-mono font-bold">{stats.excluded_messages}</span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                  <span className="text-gray-400">Auto-trimmed by overflow</span>
                  <span className="text-amber-400 font-mono font-bold">{stats.overflow_trimmed}</span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                <div>
                  <span className="text-xs text-gray-300">Auto-Trim on Overflow</span>
                  <p className="text-[10px] text-gray-500">Automatically hide oldest messages when context overflows</p>
                </div>
                <button
                  onClick={toggleAutoTrim}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                    autoTrimEnabled ? "bg-indigo-600" : "bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      autoTrimEnabled ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <button
                onClick={onTrim}
                className="w-full py-2 text-xs font-semibold bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition"
              >
                Trim 50% Oldest Messages
              </button>
            </>
          ) : (
            <div className="text-gray-500 text-sm text-center py-4">Failed to load stats</div>
          )}
        </div>
      </div>
    </div>
  );
}
