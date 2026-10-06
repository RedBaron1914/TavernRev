import { useState, useEffect } from "react";
import {
  Menu,
  Pencil,
  Activity,
  UserCircle,
  Download,
  CloudUpload,
  Check,
  X,
  Settings,
  ChevronDown,
  RefreshCw,
  Search,
  Server,
  Link as LinkIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../Avatar";
import { Character, Group } from "../../types";
import { useTranslation } from "react-i18next";
import {
  fetchAvailableModels,
  loadConnectionProfileFile,
  saveConnectionProfileFile,
} from "../settings/runtime";

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
  addToast?: (msg: string, type?: "info" | "error" | "success") => void;
  onModelChanged?: (newModel: string) => void;
  onProfileChanged?: (newProfile: string) => Promise<void> | void;
}

export function ChatHeader({
  modelName,
  activeProfileName,
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
  addToast,
  onModelChanged,
  onProfileChanged,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const avatarSrc =
    activeGroupId && activeGroup
      ? activeGroup.avatar || "default.png"
      : activeCharacter?.avatar || "default.png";
  const displayName =
    activeGroupId && activeGroup
      ? activeGroup.name
      : activeCharacter?.name || "Tavern";

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [profilesList, setProfilesList] = useState<string[]>([]);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  useEffect(() => {
    if (showModelMenu) {
      invoke<string[]>("list_connection_profiles")
        .then(setProfilesList)
        .catch(console.error);
      setCustomModelInput(
        modelName === "Select Model" || modelName === "No Profile" || modelName === "Unknown Model"
          ? ""
          : modelName
      );
    }
  }, [showModelMenu, modelName]);

  const handleFetchModels = async () => {
    if (!activeProfileName) return;
    setLoadingModels(true);
    try {
      const profile = await loadConnectionProfileFile(activeProfileName);
      const res = await fetchAvailableModels(profile);
      setFetchedModels(res.models);
      if (addToast) addToast(res.message, res.type);
    } catch (e: any) {
      console.error(e);
      if (addToast) addToast("Error fetching models: " + (e?.message || e), "error");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSelectModel = async (selectedModel: string) => {
    if (!activeProfileName || !selectedModel.trim()) return;
    try {
      const profile = await loadConnectionProfileFile(activeProfileName);
      profile.model_id = selectedModel.trim();
      await saveConnectionProfileFile(activeProfileName, profile);
      onModelChanged?.(selectedModel.trim());
      if (addToast) {
        addToast(
          t("modelSwitchedTo", "Model changed to: {{model}}", { model: selectedModel.trim() }),
          "success"
        );
      }
      setShowModelMenu(false);
    } catch (e: any) {
      console.error(e);
      if (addToast) addToast("Failed to update model: " + (e?.message || e), "error");
    }
  };

  const filteredModels = fetchedModels.filter((m) =>
    m.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <header className="relative h-16 flex items-center justify-between px-4 bg-gray-900/50 backdrop-blur-md border-b border-white/10 shrink-0 pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]">
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
          <button
            onClick={() => setShowModelMenu((prev) => !prev)}
            className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono truncate hover:underline transition max-w-fit text-left group"
            title={t("clickToSwitchModel", "Click to switch model / connection")}
          >
            <span className="truncate">{modelName}</span>
            <ChevronDown
              size={11}
              className={`shrink-0 text-cyan-400/70 group-hover:text-cyan-300 transition-transform ${
                showModelMenu ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* QUICK MODEL SWITCHER POPOVER */}
      {showModelMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowModelMenu(false)}
          />
          <div className="absolute top-16 left-4 sm:left-14 z-50 w-80 sm:w-96 bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl p-4 space-y-3 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Server size={14} className="text-cyan-400" />
                <span>{t("modelAndConnection", "Model & Connection")}</span>
              </div>
              <button
                onClick={() => setShowModelMenu(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition"
              >
                <X size={14} />
              </button>
            </div>

            {/* Profile Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                <LinkIcon size={12} className="text-indigo-400" />
                {t("connectionProfile", "Connection Profile")}
              </label>
              <select
                value={activeProfileName || ""}
                onChange={(e) => {
                  onProfileChanged?.(e.target.value);
                  setFetchedModels([]);
                }}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 transition"
              >
                {profilesList.map((p) => (
                  <option key={p} value={p}>
                    {p.replace(".json", "")}
                  </option>
                ))}
              </select>
            </div>

            {/* Model Input / Search */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-gray-400">
                  {t("activeModel", "Active Model")}
                </label>
                <button
                  onClick={handleFetchModels}
                  disabled={loadingModels || !activeProfileName}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition"
                  title={t("fetchAvailableModels", "Fetch Available Models")}
                >
                  <RefreshCw size={11} className={loadingModels ? "animate-spin" : ""} />
                  {loadingModels ? t("fetching", "Fetching...") : t("fetchList", "Fetch List")}
                </button>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => {
                      setCustomModelInput(e.target.value);
                      setSearchQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSelectModel(customModelInput);
                    }}
                    placeholder={t("searchOrEnterModel", "Enter model ID or search...")}
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-7 pr-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500 font-mono transition"
                  />
                </div>
                <button
                  onClick={() => handleSelectModel(customModelInput)}
                  disabled={!customModelInput.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition"
                >
                  {t("apply", "Apply")}
                </button>
              </div>
            </div>

            {/* Model Suggestions / Fetched list */}
            {fetchedModels.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                  {t("availableModels", "Available Models")} ({filteredModels.length})
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {filteredModels.length === 0 ? (
                    <div className="text-xs text-gray-500 py-2 text-center">
                      {t("noMatchingModels", "No matching models")}
                    </div>
                  ) : (
                    filteredModels.map((m) => {
                      const isCurrent = m === modelName;
                      return (
                        <button
                          key={m}
                          onClick={() => handleSelectModel(m)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center justify-between gap-2 ${
                            isCurrent
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              : "hover:bg-white/5 text-gray-300 border border-transparent"
                          }`}
                        >
                          <span className="truncate">{m}</span>
                          {isCurrent && <Check size={12} className="text-cyan-400 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

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
            title={t("autosyncAutosyncstatus", "Auto-Sync: {{autoSyncStatus}}", { autoSyncStatus })}
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
          title={t("downloadChat", "Download chat")}
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition hidden sm:flex"
        >
          <Download size={20} />
        </button>

        <button
          onClick={onStats}
          title={t("chatStats", "Chat Stats")}
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <Activity size={20} />
        </button>
        <button
          onClick={onPersona}
          title={t("switchPersona2", "Switch Persona")}
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <UserCircle size={20} />
        </button>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onSettings}
          title={t("settings", "Settings")}
          className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
