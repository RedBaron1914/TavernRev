import { useState } from "react";
import {
  Users,
  Plus,
  Download,
  Pencil,
  Trash2,
  MessageSquare,
  SlidersHorizontal,
  Type,
  BookOpen,
  BrainCircuit,
} from "lucide-react";
import { Chat } from "../../types";

type SidebarTab =
  | "chats"
  | "response-config"
  | "response-formatting"
  | "world-info"
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
  setActiveChatId: (id: number) => void;
  handleRenameChat: (id: number, name: string) => void;
  handleDeleteChat: (id: number, name: string) => void;
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
  setActiveChatId,
  handleRenameChat,
  handleDeleteChat,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");

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
            isMobile ? "fixed inset-y-0 left-0 z-50 shadow-2xl w-80" : "w-72 relative"
          } bg-gray-900 border-r border-white/10 flex flex-col shrink-0 animate-in slide-in-from-left duration-300 pt-[env(safe-area-inset-top)]`}
        >
          <div className="basis-[18%] min-h-[150px] border-b border-white/10 p-4">
            <div className="grid h-full grid-cols-3 gap-3">
              <button
                onClick={() => setCurrentView("character_select")}
                className="flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 text-center text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Users size={20} />
                <span>Change character</span>
              </button>
              <button
                onClick={handleNewChat}
                className="flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-600/15 px-2 text-center text-xs font-semibold text-indigo-100 transition hover:bg-indigo-600/25"
              >
                <Plus size={20} />
                <span>New chat</span>
              </button>
              <label className="flex h-full min-h-[92px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 text-center text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08] hover:text-white">
                <Download size={20} />
                <span>Import JSON</span>
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
        </aside>
      )}
    </>
  );
}
