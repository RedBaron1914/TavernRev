import { useState, useEffect } from "react";
import { X, Sparkles, Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  chatId: number;
  initialMemory: string;
  activeProfileName: string | null;
  activePresetFile: string | null;
  onClose: () => void;
  onSave: (newMemory: string) => void;
}

export const ChatMemoryModal: React.FC<Props> = ({ chatId, initialMemory, activeProfileName, activePresetFile, onClose, onSave }) => {
  const [memory, setMemory] = useState(initialMemory);
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    const unlisten = listen<any>("stream-token", (event) => {
      const { content, target_id } = event.payload;
      if (target_id === -2) {
        setMemory((prev) => prev + content);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleSummarize = async () => {
    setIsSummarizing(true);
    // Remember previous state in case of failure
    const previousMemory = memory;
    setMemory((prev) => prev + (prev.trim() ? "\n\n" : "") + "--- Chat Summary ---\n");
    try {
      await invoke("summarize_chat", {
        chatId,
        profileName: activeProfileName || "Default",
        presetName: activePresetFile || "Default",
      });
    } catch (e) {
      console.error(e);
      setMemory(previousMemory);
      alert("Summarization Failed: " + e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSave = async () => {
    try {
      await invoke("update_chat_memory", {
        chatId,
        memory,
      });
      onSave(memory);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-gray-800 rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl flex flex-col h-[80vh]">
        <div className="p-4 border-b border-white/10 flex justify-between items-center shrink-0">
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" /> Chat Memory & Notes
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2 min-h-0">
          <p className="text-xs text-gray-400 shrink-0">
            Write context, rules, or summaries specific to this chat. This text is automatically injected into the System Prompt.
          </p>
          <textarea
            className="flex-1 w-full bg-gray-900 border border-white/10 rounded-xl p-4 text-sm text-gray-200 outline-none focus:border-amber-500/50 resize-none custom-scrollbar font-mono leading-relaxed"
            placeholder="E.g. You are currently in the Whispering Woods. It is raining..."
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
          />
        </div>
        <div className="p-4 border-t border-white/10 flex justify-between items-center bg-gray-900/30 rounded-b-2xl shrink-0">
          <button
            onClick={handleSummarize}
            disabled={isSummarizing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition shadow-lg ${isSummarizing ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20 active:scale-95"}`}
          >
            {isSummarizing ? <Sparkles size={16} className="animate-pulse" /> : <Sparkles size={16} />}
            {isSummarizing ? "Summarizing..." : "Auto-Summarize Chat"}
          </button>
          
          <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSummarizing}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50"
              >
                <Save size={16} /> Save Memory
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};
