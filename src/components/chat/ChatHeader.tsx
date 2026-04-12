import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Menu,
  Pencil,
  Activity,
  UserCircle,
  Download,
  CloudUpload,
  Check,
  X,
  ArrowDownToLine,
  Settings,
  ChevronUp,
} from "lucide-react";
import Avatar from "../Avatar";
import { Character, Group } from "../../types";

export interface ContextStats {
  total_messages: number;
  excluded_messages: number;
  overflow_trimmed: number;
  tokens_used: number;
  context_size: number;
}

export interface ChatHeaderProps {
  modelName: string;
  activeChatId: number | null;
  activeProfileName: string | null;
  activeCharacter: Character | null;
  activeGroupId: number | null;
  activeGroup: Group | null;
  autoSyncStatus: "idle" | "syncing" | "success" | "error";
  onToggleSidebar: () => void;
  onEditCharacter: () => void;
  onEditGroup: () => void;
  onExportChat: () => void;
  onContextOverflow: () => void;
  onStats: () => void;
  onPersona: () => void;
  onSettings: () => void;
}

export function ChatHeader({
  modelName,
  activeChatId,
  activeProfileName,
  activeCharacter,
  activeGroupId,
  activeGroup,
  autoSyncStatus,
  onToggleSidebar,
  onEditCharacter,
  onEditGroup,
  onExportChat,
  onContextOverflow,
  onStats,
  onPersona,
  onSettings,
}: ChatHeaderProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextStats, setContextStats] = useState<ContextStats | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (showContextMenu && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [showContextMenu]);

  useEffect(() => {
    if (!showContextMenu) return;
    const close = () => setShowContextMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showContextMenu]);

  const avatarSrc =
    activeGroupId && activeGroup
      ? activeGroup.avatar || "default.png"
      : activeCharacter?.avatar || "default.png";
  const displayName =
    activeGroupId && activeGroup
      ? activeGroup.name
      : activeCharacter?.name || "Tavern";

  const fetchContextStats = async () => {
    if (!activeChatId) return;
    try {
      const stats = await invoke<ContextStats>("get_context_stats", {
        chatId: activeChatId,
        profileName: activeProfileName || "Default",
      });
      setContextStats(stats);
      setShowContextMenu(!showContextMenu);
    } catch (e) {
      console.error(e);
    }
  };

  const contextSize = contextStats?.context_size ?? 0;
  const contextPercent =
    contextSize > 0 && contextStats
      ? Math.min(100, Math.round((contextStats.tokens_used / contextSize) * 100))
      : 0;

  return (
    <header className="h-16 flex items-center justify-between px-4 bg-gray-900/50 backdrop-blur-md border-b border-white/10 shrink-0 pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition mr-1 shrink-0"
        >
          <Menu size={20} />
        </button>
        <Avatar src={avatarSrc} name={displayName} />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm leading-tight truncate">
              {displayName}
            </span>
            <button
              onClick={activeGroupId ? onEditGroup : onEditCharacter}
              className="text-gray-500 hover:text-white transition p-0.5 rounded shrink-0"
            >
              <Pencil size={12} />
            </button>
          </div>
          <div className="text-[10px] text-cyan-400 font-mono truncate">
            {modelName}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {autoSyncStatus !== "idle" && (
          <div
            className={`p-2 hidden sm:flex items-center justify-center transition-all duration-500 ${
              autoSyncStatus === "success"
                ? "text-emerald-400"
                : autoSyncStatus === "error"
                  ? "text-red-400"
                  : "text-blue-400"
            }`}
            title={`Auto-Sync: ${autoSyncStatus}`}
          >
            {autoSyncStatus === "syncing" && (
              <CloudUpload size={16} className="animate-pulse" />
            )}
            {autoSyncStatus === "success" && (
              <Check size={16} className="animate-in fade-in" />
            )}
            {autoSyncStatus === "error" && <X size={16} />}
          </div>
        )}
        <button
          onClick={onExportChat}
          title="Download chat"
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition hidden sm:flex"
        >
          <Download size={20} />
        </button>

        <div>
          <button
            ref={btnRef}
            onClick={(e) => { e.stopPropagation(); fetchContextStats(); }}
            title="Context usage"
            className={`p-2 hover:bg-white/10 rounded-full transition hidden sm:flex ${
              contextPercent > 80
                ? "text-amber-400"
                : contextPercent > 95
                  ? "text-red-400"
                  : "text-gray-400"
            }`}
          >
            <ArrowDownToLine size={20} />
          </button>
          {showContextMenu && contextStats && createPortal(
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed bg-gray-800 rounded-xl border border-white/10 shadow-2xl p-3 z-[9999] text-sm"
              style={{ top: menuPos.top, right: menuPos.right, width: 256 }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white">Context</span>
                <button onClick={() => setShowContextMenu(false)} className="text-gray-500 hover:text-white">
                  <ChevronUp size={14} />
                </button>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                  <span>Tokens</span>
                  <span>{contextStats.tokens_used} / {contextSize}</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
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
              <div className="space-y-1 text-[11px] text-gray-400">
                <div className="flex justify-between">
                  <span>Total messages</span>
                  <span className="text-white">{contextStats.total_messages}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hidden from prompt</span>
                  <span className="text-amber-400">{contextStats.excluded_messages}</span>
                </div>
                <div className="flex justify-between">
                  <span>Auto-trimmed by overflow</span>
                  <span className="text-amber-400">{contextStats.overflow_trimmed}</span>
                </div>
              </div>
              <button
                onClick={() => { onContextOverflow(); setShowContextMenu(false); }}
                className="w-full mt-3 py-1.5 text-xs font-semibold bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition"
              >
                Trim 50% Oldest Messages
              </button>
            </div>,
            document.body
          )}
        </div>

        <button
          onClick={onStats}
          title="Chat Stats"
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <Activity size={20} />
        </button>
        <button
          onClick={onPersona}
          title="Switch Persona"
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <UserCircle size={20} />
        </button>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onSettings}
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
