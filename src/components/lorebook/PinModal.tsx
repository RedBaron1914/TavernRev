import { User, MessageSquare, X } from "lucide-react";
import type { PinModalState } from "./types";

interface PinModalProps {
  modal: PinModalState;
  exclude: boolean;
  characterId: number | null;
  chatId: number | null;
  onPin: (target: "card" | "chat") => void;
  onClose: () => void;
  onSetExclude: (v: boolean) => void;
}

export function PinModal({ modal, exclude, characterId, chatId, onPin, onClose, onSetExclude }: PinModalProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-5 w-72 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-white">Link Lorebook</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-lg transition">
            <X size={14} />
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Link <span className="text-white font-semibold">{modal.bookName}</span> to:
        </p>
        <div className="flex gap-2">
          <button onClick={() => onPin("card")}
            className="flex-1 flex items-center justify-center gap-2.5 py-2 rounded-xl text-[11px] font-bold transition border border-pink-500/30 bg-pink-600/10 text-pink-300 hover:bg-pink-600/20 disabled:opacity-40"
            disabled={!characterId}>
            <User size={13} /> Character
          </button>
          <button onClick={() => onPin("chat")}
            className="flex-1 flex items-center justify-center gap-2.5 py-2 rounded-xl text-[11px] font-bold transition border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 disabled:opacity-40"
            disabled={!chatId}>
            <MessageSquare size={13} /> Chat
          </button>
        </div>
        <label className="flex items-center gap-2.5 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl cursor-pointer">
          <input type="checkbox" checked={exclude} onChange={e => onSetExclude(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
          />
          <div>
            <div className="text-[10px] font-bold text-amber-300">Exclude from global pool</div>
            <div className="text-[9px] text-amber-400/60">Won't appear in the Global tab after linking</div>
          </div>
        </label>
      </div>
    </div>
  );
}
