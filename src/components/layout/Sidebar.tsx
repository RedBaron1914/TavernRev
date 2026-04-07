import { Users, Plus, Download, Pencil, Trash2 } from "lucide-react";
import { Chat } from "../../types";

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
          <div className="p-4 border-b border-white/10 space-y-3">
            <button
              onClick={() => setCurrentView("character_select")}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-white/5 transition text-sm text-gray-400"
            >
              <Users size={18} /> Change Character
            </button>
            <button
              onClick={handleNewChat}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/20"
            >
              <Plus size={18} /> New Chat
            </button>
            <label className="w-full flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-white/5 transition text-[10px] uppercase font-bold tracking-wider text-gray-500 cursor-pointer">
              <Download size={14} /> Import .jsonl
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
        </aside>
      )}
    </>
  );
}
