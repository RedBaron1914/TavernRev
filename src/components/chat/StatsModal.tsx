import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { ChatStats } from "../../types";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from 'react-i18next'

export interface ContextStats {
  total_messages: number;
  excluded_messages: number;
  overflow_trimmed: number;
  tokens_used: number;
  context_size: number;
}

export const StatsModal = ({
  stats,
  chatId,
  profileName,
  onTrim,
  onClose,
}: {
  stats: ChatStats;
  chatId: number;
  profileName: string | null;
  onTrim: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<"stats" | "viz" | "context">("stats");
  const [vizText, setVizText] = useState("");
  const [tokens, setTokens] = useState<string[]>([]);
  
  const [contextStats, setContextStats] = useState<ContextStats | null>(null);
  const [autoTrimEnabled, setAutoTrimEnabled] = useState(true);
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    if (tab !== "context") return;
    const load = async () => {
      try {
        const [s, enabled] = await Promise.all([
          invoke<ContextStats>("get_context_stats", {
            chatId,
            profileName: profileName || "Default",
          }),
          invoke<boolean>("get_auto_trim_enabled", { chatId }),
        ]);
        setContextStats(s);
        setAutoTrimEnabled(enabled);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingContext(false);
      }
    };
    load();
  }, [tab, chatId, profileName]);

  const toggleAutoTrim = async () => {
    const next = !autoTrimEnabled;
    try {
      await invoke("set_auto_trim_enabled", { chatId, enabled: next });
      setAutoTrimEnabled(next);
    } catch (e) {
      console.error(e);
    }
  };

  const handleVisualize = async () => {
    if (!vizText) return;
    try {
      const result = await invoke<string[]>("tokenize_text", { text: vizText });
      setTokens(result);
    } catch (e) {
      console.error(e);
    }
  };

  const colors = [
    "bg-red-500/30",
    "bg-orange-500/30",
    "bg-yellow-500/30",
    "bg-green-500/30",
    "bg-emerald-500/30",
    "bg-teal-500/30",
    "bg-cyan-500/30",
    "bg-sky-500/30",
    "bg-blue-500/30",
    "bg-indigo-500/30",
    "bg-violet-500/30",
    "bg-purple-500/30",
    "bg-fuchsia-500/30",
    "bg-pink-500/30",
    "bg-rose-500/30",
  ];

  const contextSize = contextStats?.context_size ?? 0;
  const tokensUsed = contextStats?.tokens_used ?? 0;
  const contextPercent =
    contextSize > 0 ? Math.min(100, Math.round((tokensUsed / contextSize) * 100)) : 0;

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/50">
          <div className="flex gap-4">
            <button
              onClick={() => setTab("stats")}
              className={`text-sm font-bold transition ${tab === "stats" ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t('statistics', 'Statistics')}
            </button>
            <button
              onClick={() => setTab("viz")}
              className={`text-sm font-bold transition ${tab === "viz" ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t('visualizer', 'Visualizer')}
            </button>
            <button
              onClick={() => setTab("context")}
              className={`text-sm font-bold transition ${tab === "context" ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              {t('context', 'Context')}
            </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {tab === "stats" && (
            <div className="space-y-4">
              <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                <span className="text-gray-400 text-sm">{t('totalMessages', 'Total Messages')}</span>
                <span className="font-mono text-white font-bold">
                  {stats.message_count}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 px-1">
                  <span>{t('tokenUsage', 'Token Usage')}</span>
                  <span>{t('total_tokensTotal', '{{total_tokens}} total', { total_tokens: stats.total_tokens })}</span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-sm">{t('user', 'User')}</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {stats.user_tokens}
                  </span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-sm">{t('character', 'Character')}</span>
                  <span className="font-mono text-pink-400 font-bold">
                    {stats.char_tokens}
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "viz" && (
            <div className="space-y-4 h-full flex flex-col">
              <textarea
                value={vizText}
                onChange={(e) => setVizText(e.target.value)}
                placeholder={t('pasteTextHereToVisualizeTokens', 'Paste text here to visualize tokens...')}
                className="w-full bg-gray-900/50 border border-white/10 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-indigo-500 h-32 resize-none"
              />
              <button
                onClick={handleVisualize}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition"
              >
                {t('tokenize', 'Tokenize')}
              </button>
              <div className="flex-1 bg-gray-950 p-3 rounded-xl border border-white/5 font-mono text-xs flex flex-wrap content-start gap-0.5 overflow-y-auto min-h-[100px] custom-scrollbar">
                {tokens.map((t, i) => (
                  <span
                    key={i}
                    className={`px-1 rounded ${colors[i % colors.length]} text-gray-200 border border-white/5`}
                  >
                    {t.replace(/ /g, "\u00A0")}
                  </span>
                ))}
                {tokens.length === 0 && (
                  <span className="text-gray-600 italic">
                    {t('tokensWillAppearHere', 'Tokens will appear here...')}
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === "context" && (
            <div className="space-y-4">
              {loadingContext ? (
                <div className="text-gray-500 text-sm text-center py-4">Loading...</div>
              ) : contextStats ? (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{t('tokens', 'Tokens')}</span>
                      <span>{t('tokensusedContextsize', '{{tokensUsed}} / {{contextSize}}', { tokensUsed, contextSize })}</span>
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
                    <div className="text-[10px] text-right mt-0.5 text-gray-500">{t('contextpercent', '{{contextPercent}}%', { contextPercent })}</div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                      <span className="text-gray-400">{t('totalMessages2', 'Total messages')}</span>
                      <span className="text-white font-mono font-bold">{contextStats.total_messages}</span>
                    </div>
                    <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                      <span className="text-gray-400">{t('hiddenFromPrompt', 'Hidden from prompt')}</span>
                      <span className="text-amber-400 font-mono font-bold">{contextStats.excluded_messages}</span>
                    </div>
                    <div className="flex justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                      <span className="text-gray-400">{t('autotrimmedByOverflow', 'Auto-trimmed by overflow')}</span>
                      <span className="text-amber-400 font-mono font-bold">{contextStats.overflow_trimmed}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-900/50 p-2.5 rounded-lg border border-white/5">
                    <div>
                      <span className="text-xs text-gray-300">{t('autotrimOnOverflow', 'Auto-Trim on Overflow')}</span>
                      <p className="text-[10px] text-gray-500">{t('automaticallyHideOldestMessagesWhenContextOverflows', 'Automatically hide oldest messages when context overflows')}</p>
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
                    {t('trim50OldestMessages', 'Trim 50% Oldest Messages')}
                  </button>
                </>
              ) : (
                <div className="text-gray-500 text-sm text-center py-4">{t('failedToLoadStats', 'Failed to load stats')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}