import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Group, Character } from "../types";
import { X, Users, Image as ImageIcon, Save, UserMinus, UserPlus } from "lucide-react";
import Avatar from "./Avatar";

type GroupEditorProps = {
  group: Group;
  allCharacters: Character[];
  onClose: () => void;
  onSave: () => void;
};

export const GroupEditor: React.FC<GroupEditorProps> = ({ group, allCharacters, onClose, onSave }) => {
  const [name, setName] = useState(group.name);
  const [scenario, setScenario] = useState(group.scenario);
  const [avatar, setAvatar] = useState(group.avatar);
  const [activationStrategy, setActivationStrategy] = useState(group.activation_strategy);
  const [allowSelfResponses, setAllowSelfResponses] = useState(group.allow_self_responses);
  
  const [members, setMembers] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchMembers = async () => {
      try {
        const mems = await invoke<Character[]>("get_group_members", { groupId: group.id });
        if (active) setMembers(mems);
      } catch (e) {
        console.error("Failed to load group members", e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchMembers();
    return () => { active = false; };
  }, [group.id]);

  const handleSave = async () => {
    try {
      await invoke("update_group", {
        id: group.id,
        name,
        avatar,
        scenario,
        activationStrategy,
        generationMode: group.generation_mode,
        allowSelfResponses,
      });

      // Update members: This is a bit brute-force, but effective for small lists.
      // We remove all current members and re-add the selected ones.
      // Wait, there is no "remove_all_group_members" command. 
      // It's safer to just diff them or add/remove individually.
      const currentMemberIds = await invoke<Character[]>("get_group_members", { groupId: group.id }).then(res => res.map(c => c.id));
      const targetMemberIds = members.map(m => m.id);

      const toAdd = targetMemberIds.filter(id => !currentMemberIds.includes(id));
      const toRemove = currentMemberIds.filter(id => !targetMemberIds.includes(id));

      await Promise.all([
        ...toAdd.map(id => invoke("add_group_member", { groupId: group.id, characterId: id })),
        ...toRemove.map(id => invoke("remove_group_member", { groupId: group.id, characterId: id })),
        ...members.map(member => invoke("toggle_group_member_mute", { groupId: group.id, characterId: member.id, isMuted: member.is_muted || false }))
      ]);

      onSave();
    } catch (e) {
      console.error(e);
      alert("Failed to save group: " + e);
    }
  };

  const toggleMember = (char: Character) => {
    if (members.find(m => m.id === char.id)) {
      setMembers(members.filter(m => m.id !== char.id));
    } else {
      setMembers([...members, char]);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target?.result) {
        const bytes = Array.from(new Uint8Array(ev.target.result as ArrayBuffer));
        try {
          const newFilename = await invoke<string>("upload_avatar", { data: bytes });
          setAvatar(newFilename);
        } catch (err) {
          console.error("Avatar upload failed:", err);
          alert("Failed to upload avatar");
        }
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset value so the same file can be selected again if needed
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col p-2 md:p-8 animate-in fade-in duration-200 justify-center">
      <div className="w-full max-w-4xl mx-auto flex flex-col bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[95vh] md:max-h-[90vh]">
        
        {/* Header */}
        <div className="h-20 flex items-center justify-between px-4 md:px-6 bg-gray-800/50 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative group w-14 h-14 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center bg-gray-800 border border-white/10 shadow-inner">
              {avatar ? (
                <img src={convertFileSrc(`avatars/${avatar}`)} alt={name} className="w-full h-full object-cover" />
              ) : (
                <Users size={24} className="text-gray-400" />
              )}
              <label htmlFor="group-avatar-upload" className="absolute inset-0 bg-black/60 md:opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer z-10">
                <ImageIcon size={20} className="text-white" />
              </label>
              <input id="group-avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-3 truncate">
              Edit Group
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition shrink-0">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 min-h-0">
          {loading ? (
            <div className="text-center text-gray-500 mt-10">Loading members...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 h-full">
              
              {/* Left Col: Settings */}
              <div className="space-y-6 flex flex-col">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Group Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition"
                  />
                </div>

                <div className="flex-1 flex flex-col min-h-[150px]">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Group Scenario (Optional)</label>
                  <textarea
                    value={scenario}
                    onChange={e => setScenario(e.target.value)}
                    className="w-full flex-1 bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none transition resize-none custom-scrollbar"
                    placeholder="Describe the overall setting or context for this group chat..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Routing Strategy</label>
                  <select
                    value={activationStrategy}
                    onChange={e => setActivationStrategy(parseInt(e.target.value))}
                    className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none appearance-none"
                  >
                    <option value={0}>Natural (Mentions + Random)</option>
                    <option value={1}>List (Round Robin)</option>
                    <option value={2}>Manual (Pick before gen)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-2 leading-tight">
                    Determines who speaks when you send a message without explicitly mentioning a name.
                  </p>
                </div>

                <div className="flex items-center gap-3 bg-gray-950 p-4 rounded-xl border border-white/10">
                  <input
                    type="checkbox"
                    id="allowSelfResponses"
                    checked={allowSelfResponses}
                    onChange={(e) => setAllowSelfResponses(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 bg-gray-900 border-white/20 rounded shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="allowSelfResponses" className="text-sm font-bold text-white cursor-pointer select-none block truncate">Allow Self-Responses</label>
                    <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                      If disabled, algorithm forces a different character to speak next.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Col: Members */}
              <div className="flex flex-col h-full min-h-[300px] border border-white/10 rounded-xl bg-gray-950 overflow-hidden">
                <div className="p-3 bg-gray-900 border-b border-white/5 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Members ({members.length})</span>
                    <span className="text-[10px] text-gray-500">Click to add/remove</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {allCharacters.filter(c => c.id !== 0).map(char => {
                      const isMember = members.some(m => m.id === char.id);
                      const isMuted = members.find(m => m.id === char.id)?.is_muted || false;

                      return (
                        <div 
                          key={char.id} 
                          className={`flex items-center gap-3 p-2 rounded-lg transition border ${isMember ? 'bg-indigo-900/20 border-indigo-500/30' : 'hover:bg-white/5 border-transparent'}`}
                        >
                          <div className="cursor-pointer flex items-center gap-3 flex-1 min-w-0" onClick={() => toggleMember(char)}>
                            <div className={isMuted ? "opacity-50 grayscale" : ""}>
                              <Avatar src={char.avatar} name={char.name} size="sm" />
                            </div>
                            <span className={`flex-1 text-sm truncate ${isMember ? 'text-indigo-200 font-medium' : 'text-gray-300'} ${isMuted ? 'line-through opacity-50' : ''}`}>
                              {char.name}
                            </span>
                          </div>
                          
                          {isMember && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newMuteState = !isMuted;
                                setMembers(members.map(m => m.id === char.id ? { ...m, is_muted: newMuteState } : m));
                                invoke("toggle_group_member_mute", { groupId: group.id, characterId: char.id, isMuted: newMuteState });
                              }}
                              className={`p-1.5 rounded-md transition shrink-0 ${isMuted ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                              title={isMuted ? "Unmute" : "Mute"}
                            >
                              <span className="text-xs font-bold w-4 h-4 flex items-center justify-center">
                                {isMuted ? "🔇" : "🔊"}
                              </span>
                            </button>
                          )}

                          <button 
                            className="p-1 shrink-0 text-gray-500 hover:text-white"
                            onClick={() => toggleMember(char)}
                          >
                            {isMember ? (
                              <UserMinus size={16} className="text-indigo-400" />
                            ) : (
                              <UserPlus size={16} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-800/50 border-t border-white/10 shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-indigo-900/20"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};
