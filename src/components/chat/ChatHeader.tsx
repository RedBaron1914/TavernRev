import { Menu, Pencil, Activity, UserCircle, Download, CloudUpload, Check, X, Settings } from "lucide-react";
import Avatar from "../Avatar";
import { Character, Group } from "../../types";

export interface ChatHeaderProps {
  modelName: string;
  activeProfileName: string | null;
  activeCharacter: Character | null;
  activeGroupId: number | null;
  activeGroup: Group | null;
  autoSyncStatus: "idle" | "syncing" | "success" | "error";
  onToggleSidebar: () => void;
  onEditCharacter: () => void;
  onEditGroup: () => void;
  onExportChat: () => void;
  onStats: () => void;
  onPersona: () => void;
  onSettings: () => void;
}

export function ChatHeader({
  modelName,
  activeCharacter,
  activeGroupId,
  activeGroup,
  autoSyncStatus,
  onToggleSidebar,
  onEditCharacter,
  onEditGroup,
  onExportChat,
  onStats,
  onPersona,
  onSettings,
}: ChatHeaderProps) {
  const avatarSrc =
    activeGroupId && activeGroup
      ? activeGroup.avatar || "default.png"
      : activeCharacter?.avatar || "default.png";
  const displayName =
    activeGroupId && activeGroup
      ? activeGroup.name
      : activeCharacter?.name || "Tavern";

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
            className={`p-2 flex items-center justify-center transition-all duration-500 ${
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
