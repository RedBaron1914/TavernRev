import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Book, Plus, Upload, Globe, User, MessageSquare } from "lucide-react";
import { BookList } from "./lorebook/BookList";
import { EntryCard } from "./lorebook/EntryCard";
import { PinModal } from "./lorebook/PinModal";
import type { Lorebook, LoreEntry, LorebookLink, LoreTab, PinModalState } from "./lorebook/types";

const TAB_CONFIG: { id: LoreTab; label: string; icon: typeof Globe; activeText: string; activeBorder: string; activeBg: string; badgeBg: string; badgeText: string }[] = [
  { id: "global", label: "Global", icon: Globe, activeText: "text-cyan-400", activeBorder: "border-cyan-500", activeBg: "bg-cyan-500/5", badgeBg: "bg-cyan-500/20", badgeText: "text-cyan-300" },
  { id: "card", label: "Card", icon: User, activeText: "text-pink-400", activeBorder: "border-pink-500", activeBg: "bg-pink-500/5", badgeBg: "bg-pink-500/20", badgeText: "text-pink-300" },
  { id: "chat", label: "Chat", icon: MessageSquare, activeText: "text-indigo-400", activeBorder: "border-indigo-500", activeBg: "bg-indigo-500/5", badgeBg: "bg-indigo-500/20", badgeText: "text-indigo-300" },
];

export default function LorebookEditor({
  chatId, characterId, addToast,
}: {
  chatId: number | null; characterId: number | null;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [books, setBooks] = useState<Lorebook[]>([]);
  const [activeTab, setActiveTab] = useState<LoreTab>("global");
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [chatLinks, setChatLinks] = useState<LorebookLink[]>([]);
  const [charLinks, setCharLinks] = useState<LorebookLink[]>([]);
  const [pinModal, setPinModal] = useState<PinModalState | null>(null);
  const [pinExclude, setPinExclude] = useState(false);

  const refreshBooks = async () => {
    try {
      const list = await invoke<Lorebook[]>("get_lorebooks");
      setBooks(list);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refreshBooks(); }, []);

  useEffect(() => {
    if (chatId) invoke<LorebookLink[]>("get_chat_lorebook_links", { chatId }).then(setChatLinks).catch(console.error);
    else setChatLinks([]);
    if (characterId) invoke<LorebookLink[]>("get_character_lorebook_links", { characterId }).then(setCharLinks).catch(console.error);
    else setCharLinks([]);
  }, [chatId, characterId]);

  useEffect(() => {
    if (activeBookId) {
      invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId }).then(setEntries).catch(console.error);
    } else {
      setEntries([]);
    }
  }, [activeBookId]);

  const globalBooks = books.filter(b => !b.excluded_from_global);
  const cardBooks = books.filter(b => charLinks.some(l => l.book_id === b.id));
  const chatBooks = books.filter(b => chatLinks.some(l => l.book_id === b.id));
  const tabBooks = activeTab === "global" ? globalBooks : activeTab === "card" ? cardBooks : chatBooks;

  const isBookEnabled = (bookId: number, tab: LoreTab): boolean => {
    if (tab === "global") return books.find(b => b.id === bookId)?.global_enabled ?? true;
    if (tab === "card") return charLinks.find(l => l.book_id === bookId)?.enabled ?? true;
    if (tab === "chat") return chatLinks.find(l => l.book_id === bookId)?.enabled ?? true;
    return true;
  };

  const handleCreateBook = async () => {
    const name = prompt("Lorebook Name:");
    if (name) {
      const id = await invoke<number>("create_lorebook", { name });
      await refreshBooks();
      setActiveBookId(id);
    }
  };

  const handleImportBook = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const id = await invoke<number>("import_lorebook", { jsonData: content });
        await refreshBooks();
        setActiveBookId(id);
        addToast("Lorebook imported successfully!", "success");
      } catch (err) { addToast("Import failed: " + err, "error"); }
    };
    reader.readAsText(file);
  };

  const handleDeleteBook = async (id: number) => {
    if (confirm("Delete Lorebook?")) {
      await invoke("delete_lorebook", { id });
      if (activeBookId === id) setActiveBookId(null);
      refreshBooks();
    }
  };

  const handleCreateEntry = async () => {
    if (!activeBookId) return;
    await invoke("create_lore_entry", { bookId: activeBookId, keys: "keyword, key2", content: "Description..." });
    const list = await invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId });
    setEntries(list);
  };

  const handleDeleteEntry = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    await invoke("delete_lore_entry", { id });
    const list = await invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId! });
    setEntries(list);
  };

  const handleUpdateEntry = async (entry: LoreEntry, updates: Partial<LoreEntry>) => {
    const updated = { ...entry, ...updates };
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
    try {
      await invoke("update_lore_entry", {
        id: entry.id, keys: updated.keys, content: updated.content,
        enabled: updated.enabled, constant: updated.constant,
        priority: updated.priority, probability: updated.probability,
        position: updated.position, depth: updated.depth,
      });
    } catch (e) { console.error(e); }
  };

  const handlePin = async (target: "card" | "chat") => {
    if (!pinModal) return;
    const bookId = pinModal.bookId;
    try {
      if (target === "chat") {
        if (!chatId) { addToast("No active chat!", "error"); return; }
        await invoke("toggle_chat_lorebook", { chatId, bookId, active: true });
        setChatLinks(prev => [...prev, { book_id: bookId, enabled: true }]);
      } else {
        if (!characterId) { addToast("No character selected!", "error"); return; }
        await invoke("toggle_character_lorebook", { characterId, bookId, active: true });
        setCharLinks(prev => [...prev, { book_id: bookId, enabled: true }]);
      }
      if (pinExclude) {
        await invoke("set_lorebook_excluded_from_global", { bookId, excluded: true });
      }
      await refreshBooks();
      addToast(`Linked "${pinModal.bookName}" to ${target === "chat" ? "chat" : "character"}`, "success");
    } catch (e) { addToast("Link failed: " + e, "error"); }
    setPinModal(null);
    setPinExclude(false);
  };

  const handleUnpin = async (bookId: number, target: "card" | "chat") => {
    try {
      if (target === "chat" && chatId) {
        await invoke("toggle_chat_lorebook", { chatId, bookId, active: false });
        setChatLinks(prev => prev.filter(l => l.book_id !== bookId));
      } else if (target === "card" && characterId) {
        await invoke("toggle_character_lorebook", { characterId, bookId, active: false });
        setCharLinks(prev => prev.filter(l => l.book_id !== bookId));
      }
      addToast("Unlinked lorebook", "info");
    } catch (e) { addToast("Unlink failed: " + e, "error"); }
  };

  const handleToggleEnabled = async (bookId: number, target: "card" | "chat" | "global") => {
    try {
      if (target === "global") {
        const book = books.find(b => b.id === bookId);
        if (!book) return;
        const newEnabled = !book.global_enabled;
        await invoke("set_global_lorebook_enabled", { bookId, enabled: newEnabled });
        setBooks(prev => prev.map(b => b.id === bookId ? { ...b, global_enabled: newEnabled } : b));
      } else if (target === "chat" && chatId) {
        const link = chatLinks.find(l => l.book_id === bookId);
        if (!link) return;
        const newEnabled = !link.enabled;
        await invoke("set_chat_lorebook_enabled", { chatId, bookId, enabled: newEnabled });
        setChatLinks(prev => prev.map(l => l.book_id === bookId ? { ...l, enabled: newEnabled } : l));
      } else if (target === "card" && characterId) {
        const link = charLinks.find(l => l.book_id === bookId);
        if (!link) return;
        const newEnabled = !link.enabled;
        await invoke("set_character_lorebook_enabled", { characterId, bookId, enabled: newEnabled });
        setCharLinks(prev => prev.map(l => l.book_id === bookId ? { ...l, enabled: newEnabled } : l));
      }
    } catch (e) { addToast("Toggle failed: " + e, "error"); }
  };

  const handleReturnToGlobal = async (bookId: number) => {
    try {
      await invoke("set_lorebook_excluded_from_global", { bookId, excluded: false });
      await refreshBooks();
      addToast("Lorebook returned to global pool", "success");
    } catch (e) { addToast("Failed: " + e, "error"); }
  };

  return (
    <div className="relative flex flex-col h-full bg-gray-900 rounded-2xl overflow-hidden border border-white/10 animate-in fade-in">
      {/* TAB BAR */}
      <div className="flex shrink-0 border-b border-white/10 bg-gray-950/50">
        {TAB_CONFIG.map(tab => {
          const Icon = tab.icon;
          const count = tab.id === "global" ? globalBooks.length
            : tab.id === "card" ? cardBooks.length
            : chatBooks.length;
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setActiveBookId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === tab.id
                  ? `${tab.activeText} ${tab.activeBorder} ${tab.activeBg}`
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"
              }`}>
              <Icon size={13} />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === tab.id
                  ? `${tab.badgeBg} ${tab.badgeText}`
                  : "bg-gray-800 text-gray-500"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ACTIONS BAR */}
      <div className="shrink-0 border-b border-white/10 px-3 py-1.5 flex items-center gap-2 bg-gray-950/30">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex-1">
          {TAB_CONFIG.find(t => t.id === activeTab)?.label} Books
        </span>
        <button onClick={handleCreateBook} title="New Book"
          className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-white/5 text-emerald-400">
          <Plus size={14} />
        </button>
        <label className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-white/5 text-gray-400 hover:text-white cursor-pointer" title="Import JSON">
          <Upload size={14} />
          <input type="file" accept=".json" onChange={e => e.target.files?.[0] && handleImportBook(e.target.files[0])} className="hidden" />
        </label>
      </div>

      {/* BOOK LIST */}
      <div className="shrink-0 max-h-[40%] overflow-y-auto border-b border-white/10 bg-gray-950 custom-scrollbar">
        <BookList
          books={tabBooks} chatLinks={chatLinks} charLinks={charLinks}
          activeTab={activeTab} activeBookId={activeBookId}
          onSelectBook={setActiveBookId}
          onToggleEnabled={handleToggleEnabled}
          onUnpin={handleUnpin}
          onPin={(bookId, bookName) => { setPinModal({ bookId, bookName }); setPinExclude(false); }}
          onReturnToGlobal={handleReturnToGlobal}
          onDelete={handleDeleteBook}
          isBookEnabled={isBookEnabled}
        />
      </div>

      {/* ENTRIES */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-900 min-h-0">
        {activeBookId ? (
          <>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{entries.length} Entries</span>
              <button onClick={handleCreateEntry}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition">
                <Plus size={12} /> Add Entry
              </button>
            </div>
            {entries.map(entry => (
              <EntryCard key={entry.id} entry={entry} onUpdate={handleUpdateEntry} onDelete={handleDeleteEntry} />
            ))}
            {entries.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-xs border-2 border-dashed border-gray-800 rounded-xl">
                No entries yet. Click "Add Entry" to start.
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-3">
            <Book size={36} className="opacity-20"/>
            <p className="text-xs">Select a lorebook to view entries</p>
          </div>
        )}
      </div>

      {/* PIN MODAL */}
      {pinModal && (
        <PinModal
          modal={pinModal} exclude={pinExclude}
          characterId={characterId} chatId={chatId}
          onPin={handlePin}
          onClose={() => { setPinModal(null); setPinExclude(false); }}
          onSetExclude={setPinExclude}
        />
      )}
    </div>
  );
}
