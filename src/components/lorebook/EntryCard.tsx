import { useState } from "react";
import { Trash2, Anchor, ChevronDown, ChevronRight } from "lucide-react";
import type { LoreEntry } from "./types";

interface EntryCardProps {
  entry: LoreEntry;
  onUpdate: (entry: LoreEntry, updates: Partial<LoreEntry>) => void;
  onDelete: (id: number) => void;
}

export function EntryCard({ entry, onUpdate, onDelete }: EntryCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-gray-950 border border-white/5 rounded-xl p-3 space-y-2 hover:border-indigo-500/30 transition group shadow-sm">
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(c => !c)} className="shrink-0 text-gray-500 hover:text-gray-300 transition">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        <button onClick={() => onUpdate(entry, { enabled: !entry.enabled })}
          className={`w-4 h-4 rounded-full border-2 transition shrink-0 ${
            entry.enabled
              ? (entry.constant ? "bg-cyan-500 border-cyan-400" : "bg-emerald-500 border-emerald-400")
              : "bg-gray-800 border-gray-600"
          }`}
          title={entry.enabled ? (entry.constant ? "Constant" : "Enabled") : "Disabled"}
        />
        {!collapsed ? (
          <>
            <input defaultValue={entry.keys}
              onBlur={e => onUpdate(entry, { keys: e.target.value })}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-emerald-400 font-mono focus:outline-none focus:border-indigo-500 min-w-0"
              placeholder="tag1, tag2"
            />
            <button onClick={() => onUpdate(entry, { constant: !entry.constant })}
              className={`shrink-0 text-[9px] uppercase font-bold flex items-center gap-0.5 transition ${
                entry.constant ? "text-cyan-400" : "text-gray-600 hover:text-gray-400"
              }`} title="Always Active">
              <Anchor size={9}/> C
            </button>
          </>
        ) : (
          <span className="flex-1 text-xs text-gray-400 font-mono truncate">{entry.keys}</span>
        )}
        <button onClick={() => onDelete(entry.id)}
          className="shrink-0 p-1 text-gray-600 hover:text-red-400 rounded transition opacity-0 group-hover:opacity-100">
          <Trash2 size={12}/>
        </button>
      </div>
      {!collapsed && (
        <>
          <textarea defaultValue={entry.content}
            onBlur={e => onUpdate(entry, { content: e.target.value })}
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y font-mono leading-relaxed"
            placeholder="Lore entry content..."
          />
          <details>
            <summary className="text-[9px] text-gray-500 hover:text-gray-300 cursor-pointer font-bold uppercase">
              Advanced
            </summary>
            <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5 mt-2">
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-gray-500">Order</span>
                <input type="number" defaultValue={entry.priority}
                  onBlur={e => onUpdate(entry, { priority: Number(e.target.value) })}
                  className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-gray-500">Prob%</span>
                <input type="number" defaultValue={entry.probability} min={0} max={100}
                  onBlur={e => onUpdate(entry, { probability: Number(e.target.value) })}
                  className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-gray-500">Pos</span>
                <select value={entry.position} onChange={e => onUpdate(entry, { position: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="before_char">↓Char</option>
                  <option value="after_char">↑Char</option>
                  <option value="before_em">↓EM</option>
                  <option value="after_em">↑EM</option>
                  <option value="before_an">↓AN</option>
                  <option value="after_an">↑AN</option>
                  <option value="at_depth">@D</option>
                  <option value="at_depth_user">@D User</option>
                  <option value="at_depth_assistant">@D Asst</option>
                  <option value="outlet">Outlet</option>
                </select>
              </div>
              {entry.position.startsWith("at_depth") && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] uppercase font-bold text-gray-500">Depth</span>
                  <input type="number" defaultValue={entry.depth || 4}
                    onBlur={e => onUpdate(entry, { depth: Number(e.target.value) })}
                    className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
