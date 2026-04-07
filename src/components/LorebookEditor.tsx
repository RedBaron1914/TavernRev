import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Book, Plus, Trash2, Key, FileText, ChevronRight, Upload, Anchor, MessageSquare, User, Globe } from "lucide-react";

type Lorebook = { id: number; name: string; description: string; is_global: boolean; };
type LoreEntry = { id: number; book_id: number; keys: string; content: string; enabled: boolean; constant: boolean; priority: number; probability: number; position: string; depth: number; };

export default function LorebookEditor({ chatId, characterId, addToast }: { chatId: number | null, characterId: number | null, addToast: (msg: string, type?: "success" | "error" | "info") => void }) {
  console.log("LorebookEditor Props:", { chatId, characterId });
  const [books, setBooks] = useState<Lorebook[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  
  const [chatLinks, setChatLinks] = useState<number[]>([]);
  const [charLinks, setCharLinks] = useState<number[]>([]);

  const activeBook = books.find(b => b.id === activeBookId);

  const refreshBooks = async () => {
    try {
      const list = await invoke<Lorebook[]>("get_lorebooks");
      setBooks(list);
      if (!activeBookId && list.length > 0) setActiveBookId(list[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshBooks();
  }, []);

  useEffect(() => {
    if (activeBookId) {
      invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId })
        .then(setEntries)
        .catch(console.error);
    } else {
      setEntries([]);
    }
  }, [activeBookId]);

  useEffect(() => {
    if (chatId) invoke<number[]>("get_chat_lorebooks", { chatId }).then(setChatLinks).catch(console.error);
    else setChatLinks([]);
    
    if (characterId) invoke<number[]>("get_character_lorebooks", { characterId }).then(setCharLinks).catch(console.error);
    else setCharLinks([]);
  }, [chatId, characterId]);

  const toggleChatLink = async (bookId: number) => {
    if (!chatId) {
        addToast("No active chat selected! Cannot link lorebook.", "error");
        return;
    }
    const active = chatLinks.includes(bookId);
    try {
        await invoke("toggle_chat_lorebook", { chatId, bookId, active: !active });
        setChatLinks(prev => active ? prev.filter(id => id !== bookId) : [...prev, bookId]);
    } catch(e) {
        addToast("Link failed: " + e, "error");
    }
  };

  const toggleCharLink = async (bookId: number) => {
    console.log("Toggle Char Link. CharID:", characterId, "BookID:", bookId);
    if (!characterId) {
        addToast("No character selected!", "error");
        return;
    }
    const active = charLinks.includes(bookId);
    try {
        await invoke("toggle_character_lorebook", { characterId, bookId, active: !active });
        console.log("Backend Success. New State:", !active);
        setCharLinks(prev => active ? prev.filter(id => id !== bookId) : [...prev, bookId]);
    } catch(e) {
        console.error("Toggle Char Link Failed:", e);
        addToast("Link failed: " + e, "error");
    }
  };

  const toggleGlobalLink = async (bookId: number) => {
      const book = books.find(b => b.id === bookId);
      if (!book) return;
      try {
          await invoke("toggle_global_lorebook", { bookId, active: !book.is_global });
          setBooks(prev => prev.map(b => b.id === bookId ? { ...b, is_global: !b.is_global } : b));
      } catch(e) { addToast("Toggle failed: " + e, "error"); }
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
          } catch(err) { addToast("Import failed: " + err, "error"); }
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
    await invoke("create_lore_entry", {
      bookId: activeBookId,
      keys: "keyword, key2",
      content: "Description...",
    });
    const list = await invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId });
    setEntries(list);
  };

  const handleDeleteEntry = async (id: number) => {
    if (!activeBookId) return;
    if (confirm("Delete this entry?")) {
        await invoke("delete_lore_entry", { id });
        const list = await invoke<LoreEntry[]>("get_lore_entries", { bookId: activeBookId });
        setEntries(list);
    }
  };

  const handleUpdateEntry = async (entry: LoreEntry, updates: Partial<LoreEntry>) => {
      const updated = { ...entry, ...updates };
      setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
      try {
          await invoke("update_lore_entry", {
              id: entry.id,
              keys: updated.keys,
              content: updated.content,
              enabled: updated.enabled,
              constant: updated.constant,
              priority: updated.priority,
              probability: updated.probability,
              position: updated.position,
              depth: updated.depth
          });
      } catch(e) { console.error(e); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-2xl overflow-hidden border border-white/10 animate-in fade-in">
        {/* HEADER: Select Book + Actions */}
        <div className="p-4 border-b border-white/10 flex gap-3 items-center bg-gray-950/50">
            <Book className="text-indigo-400 shrink-0" size={24} />
            <div className="flex-1 relative min-w-0">
                <select 
                    value={activeBookId || ""} 
                    onChange={e => setActiveBookId(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 appearance-none focus:outline-none focus:border-indigo-500 font-bold truncate pr-8"
                >
                    <option value="" disabled>Select Lorebook...</option>
                    {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">
                    <ChevronRight size={16} className="rotate-90" />
                </div>
            </div>
            <button onClick={handleCreateBook} title="New Book" className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl transition border border-white/5 text-emerald-400 hover:text-emerald-300 shrink-0">
                <Plus size={20}/>
            </button>
            <button onClick={() => activeBookId && handleDeleteBook(activeBookId)} title="Delete Book" className="p-2.5 bg-gray-800 hover:bg-red-900/30 rounded-xl transition border border-white/5 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed shrink-0" disabled={!activeBookId}>
                <Trash2 size={20}/>
            </button>
        </div>

        {/* TOOLBAR: Links & Import */}
        <div className="px-4 py-2 border-b border-white/10 flex gap-2 items-center bg-gray-900/30 overflow-x-auto no-scrollbar">
            {activeBookId ? (
                <>
                    <button 
                        onClick={() => toggleChatLink(activeBookId)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${chatLinks.includes(activeBookId) ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" : "bg-gray-800 text-gray-400 hover:text-white border border-white/5"}`}
                        title={chatId ? "Link to Current Chat" : "No Chat Selected"}
                    >
                        <MessageSquare size={14}/> Chat
                    </button>
                    <button 
                        onClick={() => toggleCharLink(activeBookId)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${charLinks.includes(activeBookId) ? "bg-pink-600 text-white shadow-lg shadow-pink-900/20" : "bg-gray-800 text-gray-400 hover:text-white border border-white/5"}`}
                        title={characterId ? "Link to Current Character" : "No Character Selected"}
                    >
                        <User size={14}/> Char
                    </button>
                    <button 
                        onClick={() => toggleGlobalLink(activeBookId)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeBook?.is_global ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/20" : "bg-gray-800 text-gray-400 hover:text-white border border-white/5"}`}
                        title="Link Globally (Always Active)"
                    >
                        <Globe size={14}/> Global
                    </button>
                    <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
                </>
            ) : null}
            
            <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-white/5 text-gray-400 hover:text-white cursor-pointer text-xs font-bold whitespace-nowrap" title="Import JSON">
                <Upload size={14}/> Import
                <input type="file" accept=".json" onChange={e => e.target.files?.[0] && handleImportBook(e.target.files[0])} className="hidden" />
            </label>
        </div>

        {/* CONTENT: Entries List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-950">
            {activeBookId ? (
                <>
                    <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{entries.length} Entries</span>
                        <button onClick={handleCreateEntry} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition shadow-lg shadow-indigo-900/20">
                            <Plus size={14}/> Add Entry
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                        {entries.map(entry => (
                            <div key={entry.id} className="bg-gray-900 border border-white/5 rounded-xl p-4 space-y-3 hover:border-indigo-500/30 transition group shadow-sm">
                                {/* Header: Keys + Status + Delete */}
                                <div className="flex gap-3 items-start">
                                    {/* Status Indicator */}
                                    <div className="flex flex-col gap-2 mt-1">
                                        <button 
                                            onClick={() => handleUpdateEntry(entry, { enabled: !entry.enabled })}
                                            className={`w-5 h-5 rounded-full border-2 transition shadow-sm ${
                                                entry.enabled 
                                                    ? (entry.constant ? "bg-cyan-500 border-cyan-400 shadow-cyan-500/20" : "bg-emerald-500 border-emerald-400 shadow-emerald-500/20") 
                                                    : "bg-gray-800 border-gray-600"
                                            }`}
                                            title={entry.enabled ? (entry.constant ? "Constant" : "Enabled") : "Disabled"}
                                        />
                                    </div>

                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[9px] uppercase font-bold text-gray-500 flex items-center gap-1">
                                                <Key size={10} /> Keywords <span className="text-[8px] font-mono text-gray-700 ml-1">#{entry.id}</span>
                                            </label>
                                            <button 
                                                onClick={() => handleUpdateEntry(entry, { constant: !entry.constant })}
                                                className={`text-[9px] uppercase font-bold flex items-center gap-1 transition ${
                                                    entry.constant ? "text-cyan-400" : "text-gray-600 hover:text-gray-400"
                                                }`}
                                                title="Always Active (Constant)"
                                            >
                                                <Anchor size={10}/> Constant
                                            </button>
                                        </div>
                                        <input 
                                            defaultValue={entry.keys}
                                            onBlur={e => handleUpdateEntry(entry, { keys: e.target.value })}
                                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-emerald-400 font-mono focus:outline-none focus:border-indigo-500 placeholder-gray-700" 
                                            placeholder="tag1, tag2"
                                        />
                                    </div>
                                    
                                    <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 mt-4 text-gray-600 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition">
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                                
                                {/* Content */}
                                <div className="space-y-1">
                                    <label className="text-[9px] uppercase font-bold text-gray-500 flex items-center gap-1">
                                        <FileText size={10} /> Content
                                    </label>
                                    <textarea 
                                        defaultValue={entry.content}
                                        onBlur={e => handleUpdateEntry(entry, { content: e.target.value })}
                                        rows={3} 
                                        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y font-mono leading-relaxed" 
                                        placeholder="Lore entry content..."
                                    />
                                </div>

                                {/* Advanced Fields */}
                                <div className="flex gap-4 pt-3 border-t border-white/5 items-center flex-wrap">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] uppercase font-bold text-gray-500">Order</span>
                                        <input 
                                            type="number" 
                                            defaultValue={entry.priority} 
                                            onBlur={e => handleUpdateEntry(entry, { priority: Number(e.target.value) })}
                                            className="w-12 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] uppercase font-bold text-gray-500">Prob %</span>
                                        <input 
                                            type="number" 
                                            defaultValue={entry.probability} 
                                            min={0} max={100}
                                            onBlur={e => handleUpdateEntry(entry, { probability: Number(e.target.value) })}
                                            className="w-10 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] uppercase font-bold text-gray-500">Pos</span>
                                        <select 
                                            value={entry.position} 
                                            onChange={e => handleUpdateEntry(entry, { position: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-indigo-500"
                                        >
                                            <option value="before_char">↓ Char</option>
                                            <option value="after_char">↑ Char</option>
                                            <option value="before_em">↓ EM</option>
                                            <option value="after_em">↑ EM</option>
                                            <option value="before_an">↓ AN</option>
                                            <option value="after_an">↑ AN</option>
                                            <option value="at_depth">@ D ⚙️</option>
                                            <option value="at_depth_user">@ D 👤</option>
                                            <option value="at_depth_assistant">@ D 🤖</option>
                                            <option value="outlet">➡ Outlet</option>
                                        </select>
                                    </div>
                                    {entry.position.startsWith("at_depth") && (
                                    <div className="flex items-center gap-2 border-l border-white/10 pl-2">
                                        <label className="text-[9px] uppercase font-bold text-gray-500">Depth</label>
                                        <input 
                                            type="number" 
                                            defaultValue={entry.depth || 4} 
                                            onBlur={e => handleUpdateEntry(entry, { depth: Number(e.target.value) })}
                                            className="w-12 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {entries.length === 0 && (
                        <div className="text-center py-20 text-gray-600 text-sm border-2 border-dashed border-gray-800 rounded-xl">
                            No entries yet. Add keywords to trigger lore injection.
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-4">
                    <div className="p-6 bg-gray-900/50 rounded-full border border-white/5">
                        <Book size={48} className="opacity-20"/>
                    </div>
                    <p>Select or create a lorebook to manage entries.</p>
                </div>
            )}
        </div>
    </div>
  );
}