import { useState } from "react";
import { Search, Filter, Download, Plus, Users, ArrowDownAZ, ArrowUpAZ, Clock, Trash2, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../Avatar";
import { Character } from "../../types";
import { ToastType } from "../Toast";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

const SPLASHES = [
    "Now with Async!",
    "Rust Powered!",
    "Waifu inside!",
    "Don't forget to hydrate!",
    "Is this simulation?",
    "Error 418: I'm a teapot",
    "TavernRev v1.2.2!",
    "Tokio Drift!",
    "Regex magic!",
    "Prompt Engineering is Art",
    "Also try SillyTavern!",
    "No memory leaks included (maybe)",
    "Safe for work? Hopefully.",
    "Press Alt+F4 for diamonds",
    "Math verified!",
    "It works on my machine!",
    "Syntactically sweet!",
    "Panic free since 2025!",
];

const SplashText = () => {
    const [text] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
    return (
        <span 
            className="absolute animate-minecraft-splash drop-shadow-md select-none pointer-events-none z-50 whitespace-nowrap"
            style={{ 
                top: "-15px", 
                left: "-45px", 
                color: "#ffff55",
                fontWeight: "bold",
                fontSize: "12px",
                textShadow: "1px 1px 0px #3f3f00" 
            }}
        >
            {text}
        </span>
    );
};

export const CharacterSelect = ({ 
    characters, 
    onSelect, 
    onCreate, 
    onImport, 
    refreshCharacters, 
    addToast 
}: { 
    characters: Character[], 
    onSelect: (id: number) => void, 
    onCreate: () => void, 
    onImport: (file: File) => void, 
    refreshCharacters: () => void, 
    addToast: (msg: string, type?: ToastType) => void 
}) => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"az" | "za" | "newest" | "oldest">("az");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const handleDeleteChar = async (id: number, name: string) => {
    if (confirm(`Delete character "${name}" and all their chats?`)) {
      const deleteLore = confirm(`Also delete embedded lorebooks for "${name}"?`);
      try {
        await invoke("delete_character", { id, deleteLore });
        refreshCharacters();
        addToast(`Character ${name} deleted.`, "success");
      } catch (e) {
        addToast("Failed to delete: " + e, "error");
      }
    }
  };

  const filtered = characters
    .filter((c) => {
      const s = search.toLowerCase();
      if (c.name.toLowerCase().includes(s)) return true;
      if (c.tags) {
        try {
          const tagsArr = JSON.parse(c.tags);
          if (Array.isArray(tagsArr) && tagsArr.some((t: any) => String(t).toLowerCase().includes(s))) return true;
        } catch(e) {}
      }
      return false;
    })
    .sort((a, b) => {
      if (sort === "az") return a.name.localeCompare(b.name);
      if (sort === "za") return b.name.localeCompare(a.name);
      if (sort === "newest") return b.id - a.id;
      if (sort === "oldest") return a.id - b.id;
      return 0;
    });

  return (
    <div
      className={`h-dvh bg-transparent flex flex-col items-center font-sans text-gray-100 ${isMobile ? "p-0 pt-[env(safe-area-inset-top)]" : "p-8"}`}
    >
      <div
        className={`w-full flex flex-col h-full bg-gray-900/80 backdrop-blur-md overflow-visible ${isMobile ? "" : "max-w-4xl border border-white/10 rounded-2xl shadow-2xl relative"}`}
      >
        {/* Header with Splash */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gray-900/50 relative hidden md:flex overflow-visible">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/20 rounded-lg text-indigo-400 relative">
                    <Users size={24} />
                    <SplashText />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Characters</h1>
                    <p className="text-xs text-gray-400">Select a character to start chatting</p>
                </div>
            </div>
            <div className="flex gap-2">
            </div>
        </div>

        {/* Toolbar */}
        <div
          className="px-3 pb-[6px] border-b border-white/10 flex gap-3 items-center bg-gray-900/50 backdrop-blur-sm"
          style={{ paddingTop: "calc(18px + env(safe-area-inset-top, 0px))" }}
        >
          <div
            className={`relative flex-1 flex items-center transition-all duration-300 ${isSearchFocused && window.innerWidth < 768 ? "col-span-full w-full" : ""}`}
          >
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              size={16}
            />
            <input
              type="text"
              placeholder="Search characters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {(!isSearchFocused || window.innerWidth >= 768) && (
            <div className="flex gap-2 items-center animate-in fade-in zoom-in-95 duration-200 shrink-0">
              <div className="relative group">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  onBlur={() => setTimeout(() => setShowSortDropdown(false), 200)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-xs font-bold transition text-gray-300 hover:text-white">
                  <Filter size={14} />
                  <span className="hidden sm:inline">
                    {sort === "az"
                      ? "Name (A-Z)"
                      : sort === "za"
                        ? "Name (Z-A)"
                        : sort === "newest"
                          ? "Newest"
                          : "Oldest"}
                  </span>
                </button>
                <div className={`absolute right-0 top-full mt-2 w-32 bg-gray-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 transition-all origin-top ${showSortDropdown ? "scale-100 opacity-100 visible" : "scale-95 opacity-0 invisible"}`}>
                  <button
                    onMouseDown={() => { setSort("az"); setShowSortDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 flex gap-2"
                  >
                    <ArrowDownAZ size={12} /> Name A-Z
                  </button>
                  <button
                    onMouseDown={() => { setSort("za"); setShowSortDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 flex gap-2"
                  >
                    <ArrowUpAZ size={12} /> Name Z-A
                  </button>
                  <button
                    onMouseDown={() => { setSort("newest"); setShowSortDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 flex gap-2"
                  >
                    <Clock size={12} /> Newest
                  </button>
                  <button
                    onMouseDown={() => { setSort("oldest"); setShowSortDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 flex gap-2"
                  >
                    <Clock size={12} /> Oldest
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-xs transition border border-white/10 cursor-pointer">
                <Download size={14} />{" "}
                <span className="hidden sm:inline">Import</span>
                <input
                  type="file"
                  accept=".png,.json"
                  onChange={(e) => {
                    if (e.target.files?.[0]) onImport(e.target.files[0]);
                  }}
                  className="hidden"
                />
              </label>

              <button
                onClick={onCreate}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-500/20"
              >
                <Plus size={14} />{" "}
                <span className="hidden sm:inline">Create</span>
              </button>
            </div>
          )}
        </div>

        {/* Header Row */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2 bg-gray-950/50 border-b border-white/5 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
          <div className="col-span-4">Name</div>
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-right">Created</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 rounded-b-2xl">
          {filtered.map((char) => (
            <div
              key={char.id}
              onClick={() => onSelect(char.id)}
              className="flex md:grid md:grid-cols-12 gap-4 items-center px-4 py-3 rounded-xl hover:bg-white/5 cursor-pointer transition group border border-transparent hover:border-white/5"
            >
              {/* Mobile: Flex Layout / Desktop: Col 4 */}
              <div className="md:col-span-4 flex items-center gap-3 overflow-hidden flex-1 md:flex-none min-w-0">
                <div className="flex flex-col items-center shrink-0">
                  <Avatar src={char.avatar} name={char.name} size="md" />
                  <span className="md:hidden text-[8px] text-gray-600 font-mono mt-1 uppercase">
                    {char.created_at
                      ? new Date(char.created_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )
                      : ""}
                  </span>
                </div>
                <div className="flex flex-col md:block min-w-0">
                  <span className="font-bold text-sm truncate text-gray-200 group-hover:text-white transition block">
                    {char.name}
                  </span>
                  {/* Mobile Only Description Preview */}
                  <span className="md:hidden text-xs text-gray-500 truncate block">
                    {char.creator_notes || char.description}
                  </span>
                  {/* Mobile Tags */}
                  <div className="md:hidden flex flex-nowrap gap-1 mt-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {(() => {
                      try {
                        const tags = JSON.parse(char.tags || "[]");
                        return Array.isArray(tags)
                          ? tags.map((tag: string, i: number) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-gray-800 rounded text-[9px] text-gray-400 border border-white/5 shrink-0 whitespace-nowrap"
                              >
                                {tag}
                              </span>
                            ))
                          : null;
                      } catch {
                        return null;
                      }
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                    
                                                {/* Mobile Delete Button */}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteChar(char.id, char.name); }} 
                                                    className="md:hidden p-2 text-gray-500 hover:text-red-400 active:scale-95 transition"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                    
                                                {/* Desktop Only Description */}              <div className="col-span-6 hidden md:flex flex-col justify-center min-w-0">
                <div className="text-xs text-gray-500 truncate group-hover:text-gray-400 transition mb-1">
                  {char.creator_notes || char.description}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(() => {
                    try {
                      const tags = JSON.parse(char.tags || "[]");
                      return Array.isArray(tags)
                        ? tags.slice(0, 12).map((tag: string, i: number) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-gray-800 rounded-md text-[9px] text-gray-400 border border-white/5 whitespace-nowrap"
                            >
                              {tag}
                            </span>
                          ))
                        : null;
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              </div>

              {/* Date: Hidden on Mobile */}
              <div className="col-span-2 hidden md:flex justify-end items-center gap-3">
                <span className="text-[10px] text-gray-600 font-mono group-hover:text-gray-500 transition">
                  {char.created_at
                    ? new Date(char.created_at).toLocaleDateString()
                    : "N/A"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChar(char.id, char.name);
                  }}
                  className="p-2 text-gray-600 hover:text-red-400 transition"
                  title="Delete Character"
                >
                  <Trash2 size={16} />
                </button>
                <ChevronRight
                  size={16}
                  className="text-gray-500 opacity-0 group-hover:opacity-100 transition"
                />
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-600 italic">
              No characters found.
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="p-3 bg-gray-950 border-t border-white/5 text-[10px] text-gray-600 flex justify-between px-6">
            <span>{filtered.length} Characters</span>
            <span>TavernRev v1.2.2</span>
        </div>
      </div>
    </div>
  );
};
