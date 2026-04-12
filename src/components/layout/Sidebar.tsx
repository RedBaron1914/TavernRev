import { useState, useCallback, useEffect, useRef } from "react";
import {
  Users,
  Plus,
  Download,
  Pencil,
  Trash2,
  PanelLeftClose,
  MessageSquare,
  SlidersHorizontal,
  Type,
  BookOpen,
  Library,
  BrainCircuit,
} from "lucide-react";
import { Chat } from "../../types";
import { RagSettingsTab } from "../RagSettingsTab";
import { FormattingTab } from "../settings/FormattingTab";
import { TextGenTab } from "../settings/TextGenTab";
import { DEFAULT_CONNECTION_PROFILE } from "../settings/shared";
import LorebookEditor from "../LorebookEditor";
import { WorldInfoTab } from "../settings/WorldInfoTab";
import { useActiveConnectionProfile, useActivePreset } from "../settings/runtime";

type SidebarTab =
  | "chats"
  | "response-config"
  | "response-formatting"
  | "world-info"
  | "lorebooks"
  | "long-term-memory";

interface SidebarProps {
  isMobile: boolean;
  sidebarVisible: boolean;
  setSidebarVisible: (v: boolean) => void;
  setCurrentView: (v: "character_select" | "chat" | "settings") => void;
  handleNewChat: () => void;
  handleImportChat: (file: File) => void;
  chats: Chat[];
  activeChatId: number | null;
  characterId: number | null;
  setActiveChatId: (id: number) => void;
  handleRenameChat: (id: number, name: string) => void;
  handleDeleteChat: (id: number, name: string) => void;
  addToast: (msg: string, type?: "info" | "error" | "success") => void;
}

export function Sidebar({
  isMobile,
  sidebarVisible,
  setSidebarVisible,
  setCurrentView,
  handleNewChat,
  handleImportChat,
  chats,
  activeChatId,
  characterId,
  setActiveChatId,
  handleRenameChat,
  handleDeleteChat,
  addToast,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    return saved ? Number(saved) : 346;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(280, Math.min(800, startWidthRef.current + delta));
      sidebarWidthRef.current = newWidth;
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("sidebarWidth", String(sidebarWidthRef.current));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const {
    presetsList,
    activePresetFile,
    formData,
    loadPresetData,
    handleFieldChange,
  } = useActivePreset();
  const { connectionData } = useActiveConnectionProfile(DEFAULT_CONNECTION_PROFILE);

  const tabs: {
    id: SidebarTab;
    label: string;
    icon: typeof MessageSquare;
  }[] = [
    { id: "chats", label: "Chats", icon: MessageSquare },
    {
      id: "response-config",
      label: "AI response configuration",
      icon: SlidersHorizontal,
    },
    {
      id: "response-formatting",
      label: "AI response formatting",
      icon: Type,
    },
    { id: "world-info", label: "World info", icon: BookOpen },
    { id: "lorebooks", label: "Lorebooks", icon: Library },
    {
      id: "long-term-memory",
      label: "Long-term memory",
      icon: BrainCircuit,
    },
  ];

  const renderTabContent = () => {
    if (activeTab === "chats") {
      return (
        <nav className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center gap-1 p-1 rounded-lg transition-all ${
                activeChatId === chat.id
                  ? "bg-indigo-600/20 border border-indigo-500/30"
                  : "hover:bg-white/5 border border-transparent"
              }`}
            >
              <button
                onClick={() => {
                  setActiveChatId(chat.id);
                  if (isMobile) setSidebarVisible(false);
                }}
                className="flex-1 text-left p-1.5 min-w-0"
              >
                <div
                  className={`truncate text-sm font-medium ${
                    activeChatId === chat.id ? "text-white" : "text-gray-400"
                  }`}
                >
                  {chat.name}
                </div>
                <div className="text-[10px] text-gray-500">
                  {new Date(chat.created_at).toLocaleDateString()}
                </div>
              </button>
              <div
                className={`flex gap-0.5 pr-1 transition-opacity ${
                  isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <button
                  onClick={() => handleRenameChat(chat.id, chat.name)}
                  className="p-1 text-gray-500 hover:text-white"
                  title="Rename Chat"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => handleDeleteChat(chat.id, chat.name)}
                  className="p-1 text-gray-500 hover:text-red-400"
                  title="Delete Chat"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </nav>
      );
    }

    if (activeTab === "long-term-memory") {
      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          <RagSettingsTab chatId={activeChatId} addToast={addToast} compact />
        </div>
      );
    }

    if (activeTab === "world-info") {
      if (!formData) {
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 text-sm text-gray-400">
            Loading world info settings...
          </div>
        );
      }

      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          <WorldInfoTab
            formData={formData}
            handleFieldChange={handleFieldChange}
            chatId={activeChatId}
            characterId={characterId}
            addToast={addToast}
            compact
            showLorebooks={false}
          />
        </div>
      );
    }

    if (activeTab === "lorebooks") {
      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 min-h-0">
          <LorebookEditor
            chatId={activeChatId}
            characterId={characterId}
            addToast={addToast}
          />
        </div>
      );
    }

    if (activeTab === "response-formatting") {
      if (!formData) {
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 text-sm text-gray-400">
            Loading formatting settings...
          </div>
        );
      }

      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          <FormattingTab
            connectionData={connectionData}
            formData={formData}
            handleFieldChange={handleFieldChange}
            compact
          />
        </div>
      );
    }

    if (activeTab === "response-config") {
      if (!formData) {
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 text-sm text-gray-400">
            Loading response configuration...
          </div>
        );
      }

      return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
          <TextGenTab
            activePresetFile={activePresetFile}
            presetsList={presetsList}
            loadPresetData={loadPresetData}
            handleCreatePreset={() => setCurrentView("settings")}
            handleDeletePreset={() => setCurrentView("settings")}
            handleImportPreset={() => setCurrentView("settings")}
            handleExportPreset={() => setCurrentView("settings")}
            formData={formData}
            handleFieldChange={handleFieldChange}
            renderPromptManager={() => (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm text-gray-400">
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
                  Prompt Manager
                </div>
                <p>Prompt manager is still available in the full Settings screen.</p>
                <button
                  onClick={() => setCurrentView("settings")}
                  className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-600/15 px-3 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-600/25"
                >
                  Open Full Settings
                </button>
              </div>
            )}
            compact
          />
        </div>
      );
    }

    const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label;

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 text-sm text-gray-400">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
            In Progress
          </div>
          <div className="text-base font-semibold text-gray-200">{activeTabLabel}</div>
          <p>
            This tab shell is ready. The actual settings content will be moved here in the next
            step.
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {isMobile && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      {/* SIDEBAR */}
      {sidebarVisible && (
        <aside
          className={`${
            isMobile ? "fixed inset-y-0 left-0 z-50 shadow-2xl w-96" : "relative"
          } bg-gray-900 border-r border-white/10 flex flex-col shrink-0 animate-in slide-in-from-left duration-300 pt-[env(safe-area-inset-top)]`}
          style={!isMobile ? { width: sidebarWidth } : undefined}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
              Chat Sidebar
            </div>
            <button
              onClick={() => setSidebarVisible(false)}
              className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              title="Hide sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentView("character_select")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Users size={14} />
                <span>Character</span>
              </button>
              <button
                onClick={handleNewChat}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/15 px-2 py-2 text-[11px] font-semibold text-indigo-100 transition hover:bg-indigo-600/25"
              >
                <Plus size={14} />
                <span>New</span>
              </button>
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white">
                <Download size={14} />
                <span>Import</span>
                <input
                  type="file"
                  accept=".jsonl"
                  onChange={(e) =>
                    e.target.files?.[0] && handleImportChat(e.target.files[0])
                  }
                  className="hidden"
                />
              </label>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-white/10 p-2">
              <div className="grid grid-cols-2 gap-2">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex min-h-[54px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      activeTab === id
                        ? "border-indigo-500/40 bg-indigo-600/15 text-white"
                        : "border-white/5 bg-white/[0.02] text-gray-400 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {renderTabContent()}
          </div>
          {!isMobile && (
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/30 transition-colors z-10"
              title="Drag to resize"
            />
          )}
        </aside>
      )}
    </>
  );
}
