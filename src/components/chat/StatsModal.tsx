import { useState } from "react";
import { X } from "lucide-react";
import { ChatStats } from "../../types";
import { invoke } from "@tauri-apps/api/core";

export const StatsModal = ({
  stats,
  onClose,
}: {
  stats: ChatStats;
  onClose: () => void;
}) => {
  const [tab, setTab] = useState<"stats" | "viz">("stats");
  const [vizText, setVizText] = useState("");
  const [tokens, setTokens] = useState<string[]>([]);

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

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-gray-800 rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/50">
          <div className="flex gap-4">
            <button
              onClick={() => setTab("stats")}
              className={`text-sm font-bold transition ${tab === "stats" ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              Statistics
            </button>
            <button
              onClick={() => setTab("viz")}
              className={`text-sm font-bold transition ${tab === "viz" ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              Visualizer
            </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {tab === "stats" ? (
            <div className="space-y-4">
              <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                <span className="text-gray-400 text-sm">Total Messages</span>
                <span className="font-mono text-white font-bold">
                  {stats.message_count}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 px-1">
                  <span>Token Usage</span>
                  <span>{stats.total_tokens} total</span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-sm">User</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {stats.user_tokens}
                  </span>
                </div>
                <div className="flex justify-between bg-gray-900/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-sm">Character</span>
                  <span className="font-mono text-pink-400 font-bold">
                    {stats.char_tokens}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 h-full flex flex-col">
              <textarea
                value={vizText}
                onChange={(e) => setVizText(e.target.value)}
                placeholder="Paste text here to visualize tokens..."
                className="w-full bg-gray-900/50 border border-white/10 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-indigo-500 h-32 resize-none"
              />
              <button
                onClick={handleVisualize}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition"
              >
                Tokenize
              </button>
              <div className="flex-1 bg-gray-950 p-3 rounded-xl border border-white/5 font-mono text-xs flex flex-wrap content-start gap-0.5 overflow-y-auto min-h-[100px]">
                {tokens.map((t, i) => (
                  <span
                    key={i}
                    className={`px-1 rounded ${colors[i % colors.length]} text-gray-200 border border-white/5`}
                  >
                    {t.replace(/ /g, " ")}
                  </span>
                ))}
                {tokens.length === 0 && (
                  <span className="text-gray-600 italic">
                    Tokens will appear here...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
