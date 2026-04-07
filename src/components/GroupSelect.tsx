import { useState } from "react";
import { Group, Character } from "../types";
import { Search, Plus, Users, Trash2 } from "lucide-react";
import Avatar from "./Avatar";

type GroupSelectProps = {
  groups: Group[];
  characters: Character[];
  onSelect: (id: number) => void;
  onCreate: (name: string, members: number[]) => void;
  onDelete: (id: number, name: string) => void;
};

export const GroupSelect: React.FC<GroupSelectProps> = ({ groups, characters, onSelect, onCreate, onDelete }) => {
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  const filtered = groups.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (newGroupName.trim() && selectedMembers.length > 0) {
      onCreate(newGroupName.trim(), selectedMembers);
      setShowCreateModal(false);
      setNewGroupName("");
      setSelectedMembers([]);
    }
  };

  const toggleMember = (charId: number) => {
    setSelectedMembers(prev => 
      prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="p-4 border-b border-white/5 space-y-4 pt-[env(safe-area-inset-top)]">
        <div className="flex gap-2">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-3.5 text-gray-500 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl aspect-square w-12 transition-colors shadow-lg shadow-indigo-900/20"
            title="Create Group"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Group List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar pb-[env(safe-area-inset-bottom)]">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            No groups found. Create one!
          </div>
        ) : (
          filtered.map(group => (
            <div
              key={group.id}
              onClick={() => onSelect(group.id)}
              className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group text-left border border-transparent hover:border-white/5 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-800 flex items-center justify-center">
                {group.avatar ? (
                  <Avatar src={group.avatar} name={group.name} />
                ) : (
                  <Users className="text-gray-500" size={24} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white truncate text-base">{group.name}</h3>
                <p className="text-xs text-gray-400 truncate mt-1">
                  {group.scenario || "No scenario set"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(group.id, group.name);
                }}
                className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100"
                title="Delete Group"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-4 border-b border-white/5 shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users size={20} className="text-indigo-400" />
                Create New Group
              </h2>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 outline-none"
                  placeholder="The Fellowship"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Members ({selectedMembers.length})</label>
                <div className="space-y-1 bg-gray-950 border border-white/5 rounded-lg p-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {characters.filter(c => c.name !== "System").map(c => (
                    <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-md cursor-pointer transition">
                      <input 
                        type="checkbox" 
                        checked={selectedMembers.includes(c.id)}
                        onChange={() => toggleMember(c.id)}
                        className="accent-indigo-500 w-4 h-4 rounded bg-gray-800 border-gray-700"
                      />
                      <div className="w-8 h-8 rounded-md overflow-hidden bg-gray-800 shrink-0">
                        <Avatar src={c.avatar} name={c.name} size="sm" />
                      </div>
                      <span className="text-sm text-gray-200 truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/5 flex gap-3 justify-end shrink-0 bg-gray-900 rounded-b-2xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newGroupName.trim() || selectedMembers.length === 0}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};