import { useState, useEffect, useRef } from "react";
import { 
  X, Image, Cpu, Plus, Trash2, Download, Save, 
  Book, MessageSquare, Sparkles, ChevronRight,
  UserCircle, History,
  Layout, Type, MessageCircle, Menu, Bot,
  Edit, Check, Link
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../Avatar";
import { Character } from "../../types";
import { useTranslation } from 'react-i18next'
import { DiffViewer } from "./DiffViewer";
import { renderMessageHtml } from "../../App";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

type EditorSection = "general" | "description" | "personality" | "scenario" | "examples" | "greetings" | "janitor";

interface StudioMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface StudioAssistResponse {
  text: string;
  proposed_changes: Record<string, string>;
}

interface StudioChat {
  id: string;
  title: string;
  date: number;
  messages: StudioMessage[];
}

export const CharacterEditor = ({ 
  character,
  onSave,
  onCancel,
  addToast,
}: { 
  character: Character;
  onSave: (char: Character) => void;
  onCancel: () => void;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState(character);
  const [janitorShadowEnabled, setJanitorShadowEnabled] = useState<boolean>(() => {
    try {
      const cardData = JSON.parse(character.card_data || "{}");
      return !!cardData.extensions?.janitor?.shadow_enabled;
    } catch (e) {
      return false;
    }
  });
  const [janitorCharacterId, setJanitorCharacterId] = useState<string>(() => {
    try {
      const cardData = JSON.parse(character.card_data || "{}");
      return cardData.extensions?.janitor?.character_id || "";
    } catch (e) {
      return "";
    }
  });
  const [janitorChatId, setJanitorChatId] = useState<string>(() => {
    try {
      const cardData = JSON.parse(character.card_data || "{}");
      return cardData.extensions?.janitor?.chat_id?.toString() || "";
    } catch (e) {
      return "";
    }
  });
  const [activeSection, setActiveSection] = useState<EditorSection>("general");
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showAssistant, setShowAssistant] = useState(!isMobile);
  const [assistantMessages, setAssistantMessages] = useState<StudioMessage[]>([
    { role: 'assistant', content: t('helloIAmYourAiStudioAssistantICanHelpYouImproveYourCharacterCardTryAskingMeToMakeTheDescriptionMoreDetailedOrSuggestSomeSnarkyPersonalityTraits', 'Hello! I am your AI Studio Assistant. I can help you improve your character card. Try asking me to \'make the description more detailed\' or \'suggest some snarky personality traits\'.') }
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [proposedChanges, setProposedChanges] = useState<Record<string, string | null>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [savedChats, setSavedChats] = useState<StudioChat[]>([]);
  const [currentStudioChatId, setCurrentStudioChatId] = useState<string | null>(null);
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editMsgContent, setEditMsgContent] = useState("");

  const isInitialMount = useRef(true);

  const scrollToBottom = () => {
    const chatContainer = document.getElementById("assistant-chat-history");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [assistantMessages]);

  useEffect(() => {
    invoke<string>("load_studio_chats", { characterId: String(character.id || character.uuid) })
      .then(json => setSavedChats(JSON.parse(json)))
      .catch(console.error);
  }, [character.id, character.uuid]);

  useEffect(() => {
    setAssistantMessages([
      { role: 'assistant', content: t('helloIAmYourAiStudioAssistantICanHelpYouImproveYourCharacterCardTryAskingMeToMakeTheDescriptionMoreDetailedOrSuggestSomeSnarkyPersonalityTraits', 'Hello! I am your AI Studio Assistant. I can help you improve your character card. Try asking me to \'make the description more detailed\' or \'suggest some snarky personality traits\'.') }
    ]);
    setCurrentStudioChatId(null);
    setEditingMsgIndex(null);
    isInitialMount.current = true;
  }, [character.id, character.uuid, t]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (currentStudioChatId) {
      setSavedChats(prevChats => {
        const updated = prevChats.map(c => 
          c.id === currentStudioChatId ? { ...c, messages: assistantMessages, date: Date.now() } : c
        );
        invoke("save_studio_chats", {
          characterId: String(character.id || character.uuid),
          chatsJson: JSON.stringify(updated)
        }).catch(console.error);
        return updated;
      });
    }
  }, [assistantMessages, currentStudioChatId, character.id, character.uuid]);

  const sendAssistantMessage = async (manualInput?: string) => {
    const input = manualInput || assistantInput;
    if ((!input.trim() && attachedImages.length === 0) || isAssistantThinking) return;

    const newMsgs: StudioMessage[] = [...assistantMessages, { role: 'user', content: input, images: attachedImages.length > 0 ? attachedImages : undefined }];
    setAssistantMessages(newMsgs);
    setAssistantInput("");
    setAttachedImages([]);
    setIsAssistantThinking(true);

    try {
      const activeProfile = localStorage.getItem("active_profile") || "Default";
      const activePreset = localStorage.getItem("active_preset") || "Default";
      
      const altGreetingsStr = alts.length > 0 ? `\n- Alternate Greetings:\n${alts.map((alt, i) => `  [#${i+1}] ${alt}`).join('\n')}` : "\n- Alternate Greetings: None";

      const studioSystemPrompt = `You are the TavernRev AI Character Studio Assistant. Your goal is to help users craft high-quality AI characters.\n\nIMPORTANT: If the 'replace' function/tool is available to you, you MUST use it to propose changes and DO NOT use XML tags. If the 'replace' tool is NOT available, you MUST use the following XML tags:\n<change field="description">New improved content</change>\n\nSupported fields: name, description, personality, scenario, first_mes, alternate_greetings, mes_example, creator_notes.\n\nCurrent Character State:\n- Name: ${formData.name}\n- Description: ${formData.description}\n- Personality: ${formData.personality}\n- Scenario: ${formData.scenario}\n- First Message: ${formData.first_mes}${altGreetingsStr}\n- Message Examples: ${formData.mes_example}\n- Creator Notes: ${formData.creator_notes}\n\nAlways explain WHAT you are changing and WHY. Be creative, consistent, and adhere to the character's core concept.`;

      const response = await invoke<StudioAssistResponse>("studio_assist", {
        profileName: activeProfile,
        presetName: activePreset,
        messages: [
            { role: 'system', content: studioSystemPrompt },
            ...newMsgs.slice(-5)
        ]
      });

      setProposedChanges(prev => ({ ...prev, ...response.proposed_changes }));
      setAssistantMessages([...newMsgs, { role: 'assistant', content: response.text }]);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setIsAssistantThinking(false);
    }
  };

  const saveStudioChat = async () => {
    if (assistantMessages.length <= 1) return;
    const title = assistantMessages.find(m => m.role === 'user')?.content.slice(0, 30) + '...';
    const chatId = currentStudioChatId || crypto.randomUUID();
    const newChat: StudioChat = {
        id: chatId,
        title: title || "New Chat",
        date: Date.now(),
        messages: [...assistantMessages]
    };
    try {
        let updatedChats;
        if (currentStudioChatId) {
            updatedChats = savedChats.map(c => c.id === chatId ? newChat : c);
        } else {
            updatedChats = [newChat, ...savedChats];
        }
        await invoke("save_studio_chats", {
            characterId: String(character.id || character.uuid),
            chatsJson: JSON.stringify(updatedChats)
        });
        setSavedChats(updatedChats);
        setCurrentStudioChatId(chatId);
        addToast(t('chatSaved', 'Chat saved successfully!'), "success");
    } catch (e) {
        addToast("Failed to save chat: " + e, "error");
    }
  };

  const loadStudioChat = (chat: StudioChat) => {
    setAssistantMessages(chat.messages);
    setCurrentStudioChatId(chat.id);
    setShowHistory(false);
  };

  const deleteStudioChat = async (id: string) => {
    const newChats = savedChats.filter(c => c.id !== id);
    try {
        await invoke("save_studio_chats", {
            characterId: String(character.id || character.uuid),
            chatsJson: JSON.stringify(newChats)
        });
        setSavedChats(newChats);
        if (currentStudioChatId === id) {
            setCurrentStudioChatId(null);
        }
    } catch (e) {
        addToast("Failed to delete chat: " + e, "error");
    }
  };

  const applyChange = (field: string) => {
    const content = proposedChanges[field];
    if (content) {
      if (field === "alternate_greetings") {
          try {
              const parsed = JSON.parse(content);
              setAlts(Array.isArray(parsed) ? parsed : [content]);
          } catch {
              setAlts(content.split('\n').map(s => s.trim().replace(/^\[#\d+\]\s*/, '')).filter(Boolean));
          }
      } else {
          handleChange(field as keyof Character, content);
      }
      setProposedChanges(prev => ({ ...prev, [field]: null }));
      addToast(`Applied changes to ${field}`, "success");
    }
  };

  const rejectChange = (field: string) => {
    setProposedChanges(prev => ({ ...prev, [field]: null }));
  };

  const DiffViewerComponent = ({ field, original, proposed }: { field: string, original: string, proposed: string }) => {
    return (
        <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
                    <Sparkles size={14} />{t('proposedChangesForField', 'Proposed Changes for {{field}}', { field })}</div>
                <div className="flex gap-2">
                    <button onClick={() => rejectChange(field)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-[10px] font-bold uppercase transition">{t('reject', 'Reject')}</button>
                    <button onClick={() => applyChange(field)} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase transition shadow-lg shadow-indigo-900/20">{t('applyChange', 'Apply Change')}</button>
                </div>
            </div>
            <div className="relative group overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/5 p-1">
                <DiffViewer oldText={original} newText={proposed} />
            </div>
        </div>
    );
  };

  const [alts, setAlts] = useState<string[]>(() => {
    try {
      return JSON.parse(character.alternate_greetings || "[]");
    } catch {
      return [];
    }
  });
  const [talkativeness, setTalkativeness] = useState<number>(() => {
    try {
      const cardData = JSON.parse(character.card_data || "{}");
      return (
        cardData?.extensions?.talkativeness ??
        cardData?.data?.extensions?.talkativeness ??
        0.5
      );
    } catch {
      return 0.5;
    }
  });
  const [tokens, setTokens] = useState(0);

  const handleChange = (field: keyof Character, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const bytes = Array.from(
            new Uint8Array(ev.target.result as ArrayBuffer),
          );
          try {
            const newFilename = await invoke<string>("upload_avatar", {
              data: bytes,
            });
            handleChange("avatar", newFilename);
          } catch (err) {
            console.error(err);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      const text = `${formData.name}\n${formData.description}\n${formData.personality}\n${formData.scenario}\n${formData.first_mes}\n${formData.creator_notes}\n${alts.join("\n")}`;
      try {
        const count = await invoke<number>("count_tokens", { text });
        setTokens(count);
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, alts]);

  const handleSave = () => {
    let cardDataObj: any = {};
    try {
      cardDataObj = JSON.parse(formData.card_data || "{}");
    } catch (e) {}
    if (!cardDataObj.extensions) cardDataObj.extensions = {};
    cardDataObj.extensions.talkativeness = talkativeness;
    
    if (!cardDataObj.extensions.janitor) cardDataObj.extensions.janitor = {};
    cardDataObj.extensions.janitor.shadow_enabled = janitorShadowEnabled;
    cardDataObj.extensions.janitor.character_id = janitorCharacterId;
    cardDataObj.extensions.janitor.chat_id = janitorChatId ? (isNaN(Number(janitorChatId)) ? janitorChatId : Number(janitorChatId)) : "";

    onSave({
      ...formData,
      card_data: JSON.stringify(cardDataObj),
      alternate_greetings: JSON.stringify(alts),
    });
  };

  const handleExportChar = async () => {
    try {
      const json = await invoke<string>("export_character_json", {
        id: formData.id,
      });
      const filename = `${formData.name.replace(/[/\\?%*:|"<>]/g, "_")}.json`;

      if (isMobile) {
        if (
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({
            files: [new File([json], filename, { type: "application/json" })],
          })
        ) {
          try {
            const file = new File([json], filename, { 
              type: "application/json",
            });
            await navigator.share({
              files: [file],
              title: t('exportCharacter', 'Export Character'),
              text: t('tavernrevCharacterExportFilename', 'TavernRev Character Export: {{filename}}', { filename }),
            });
            return;
          } catch (e) {
            console.warn("Share failed", e);
          }
        }

        try {
          await navigator.clipboard.writeText(json);
          addToast("Share failed. Character JSON copied to clipboard!", "info");
        } catch (e) {
          addToast("Export failed: " + e, "error");
        }
        return;
      }

      try {
        const savedPath = await invoke<string>("save_export_file", {
          filename,
          content: json,
        });
        addToast(`Character saved to Downloads folder!\nPath: ${savedPath}`, "success");
        return;
      } catch (err) {
        console.warn("Rust save failed, falling back", err);
      }

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast("Export failed: " + e, "error");
    }
  };

  const sections = [
    { id: "general", label: t('generalInfo', 'General Info'), icon: <UserCircle size={18}/> },
    { id: "description", label: t('description', 'Description'), icon: <Type size={18}/> },
    { id: "personality", label: t('personality', 'Personality'), icon: <Layout size={18}/> },
    { id: "scenario", label: t('scenario', 'Scenario'), icon: <History size={18}/> },
    { id: "examples", label: t('exampleMessages', 'Example Messages'), icon: <MessageSquare size={18}/> },
    { id: "greetings", label: t('greetings', 'Greetings'), icon: <MessageCircle size={18}/> },
    { id: "janitor", label: t('janitorProxy', 'Janitor Proxy'), icon: <Link size={18}/> },
  ].filter(sec => !isMobile || sec.id !== "janitor");

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 animate-in fade-in duration-500 overflow-hidden">
      {/* HEADER */}
      <header className="shrink-0 border-b border-white/10 bg-gray-900/50 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 z-20 pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition">
            <X size={20} />
          </button>
          {isMobile && (
            <button 
                onClick={() => setShowMobileNav(!showMobileNav)}
                className={`p-2 rounded-xl transition ${showMobileNav ? 'bg-indigo-600 text-white' : 'bg-white/5 text-indigo-400'}`}
            >
                <Menu size={20} />
            </button>
          )}
          <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block" />
          <div className="flex items-center gap-3">
             <Avatar src={formData.avatar} name={formData.name} size="xs" />
             <div className="hidden sm:block">
                <h1 className="text-sm font-bold truncate max-w-[200px]">{formData.name || "Unnamed Character"}</h1>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                    <Cpu size={10} />{t('tokensTokens', '{{tokens}} tokens', { tokens })}</div>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <button
                onClick={() => setShowAssistant(!showAssistant)}
                className={`p-2 rounded-xl transition ${showAssistant ? 'bg-indigo-600 text-white' : 'bg-white/5 text-amber-400'}`}
                title={t('toggleAiAssistant', 'Toggle AI Assistant')}
            >
                <Bot size={20} />
            </button>
            <button
                onClick={handleExportChar}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/5 hover:text-indigo-400 transition border border-transparent hover:border-indigo-500/20"
            >
                <Download size={16} /> {t('exportJson', 'Export JSON')}
            </button>
            <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-900/20 transition active:scale-95"
            >
                <Save size={16} /> {t('saveChanges', 'Save Changes')}
            </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT NAVIGATOR (SIDEBAR) */}
        <aside className={`${isMobile ? `fixed top-[calc(4rem+env(safe-area-inset-top))] bottom-0 pb-[env(safe-area-inset-bottom)] left-0 z-30 w-64 bg-gray-900 border-r border-white/10 shadow-2xl transform transition-transform duration-300 ${showMobileNav ? 'translate-x-0' : 'translate-x-[-100%]'}` : 'w-64 border-r border-white/5 bg-gray-950/50 flex flex-col'}`}>
            <nav className="p-4 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-4">{t('studioNavigator', 'Studio Navigator')}</div>
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id as EditorSection)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${activeSection === s.id ? 'bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    >
                        <div className="flex items-center gap-3">
                            <span className={activeSection === s.id ? 'text-indigo-400' : 'text-gray-400 md:text-gray-500 md:group-hover:text-gray-300'}>{s.icon}</span>
                            <span className="text-sm font-medium">{s.label}</span>
                        </div>
                        {activeSection === s.id && <ChevronRight size={14} className="animate-in slide-in-from-left-1" />}
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-white/5">
                <div className="p-3 bg-gray-900/50 rounded-xl border border-white/5">
                    <div className="text-[10px] text-gray-500 font-bold mb-1">{t('dataBank', 'DATA BANK')}</div>
                    <div className="text-[11px] text-gray-300 flex items-center gap-2 italic">
                         <Book size={12} className="text-emerald-400" /> {t('linkedLorebooksComingSoon', 'Linked Lorebooks (Coming Soon)')}
                    </div>
                </div>
            </div>
        </aside>

        {/* CENTER WORKSPACE */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-950">
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-[env(safe-area-inset-bottom)]">
                <div className="max-w-4xl mx-auto p-4 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    
                    {activeSection === "general" && (
                        <div className="space-y-8">
                             <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="relative group cursor-pointer shrink-0 mx-auto md:mx-0">
                                    <Avatar src={formData.avatar} name={formData.name} size="xl" />
                                    <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center md:opacity-0 group-hover:opacity-100 transition duration-300 border-2 border-dashed border-indigo-500/50">
                                        <Image size={32} className="text-white animate-bounce" />
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">{t('changePhoto', 'CHANGE PHOTO')}</div>
                                </div>
                                <div className="flex-1 space-y-6 w-full">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1">{t('characterName', 'Character Name')}</label>
                                        {proposedChanges.name ? (
                                            <DiffViewerComponent field="name" original={formData.name} proposed={proposedChanges.name} />
                                        ) : (
                                            <input
                                                value={formData.name}
                                                onChange={(e) => handleChange("name", e.target.value)}
                                                className="w-full bg-gray-900 border border-white/10 rounded-2xl px-5 py-4 text-lg font-bold text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                                placeholder={t('enterName', 'Enter name...')}
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1">{t('tags', 'Tags')}</label>
                                        <input
                                            value={(() => {
                                                try { return JSON.parse(formData.tags || "[]").join(", "); } catch { return formData.tags; }
                                            })()}
                                            onChange={(e) => {
                                                const tagsArray = e.target.value.split(",").map((t) => t.trim()).filter((t) => t);
                                                handleChange("tags", JSON.stringify(tagsArray));
                                            }}
                                            className="w-full bg-gray-900 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                                            placeholder={t('egFantasyHeroSnarky', 'e.g. fantasy, hero, snarky')}
                                        />
                                    </div>
                                </div>
                             </div>

                             <div className="p-6 bg-gray-900/50 rounded-3xl border border-white/5 space-y-4">
                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex justify-between items-center">
                                    <span>{t('talkativenessGroupChats', 'Talkativeness (Group Chats)')}</span>
                                    <span className="text-indigo-300 font-mono text-base">{Math.round(talkativeness * 100)}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={talkativeness}
                                    onChange={(e) => setTalkativeness(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500 bg-gray-800 rounded-lg appearance-none h-3 cursor-pointer"
                                />
                                <p className="text-xs text-gray-500 leading-relaxed italic">
                                    {t('controlsHowOftenThisCharacterWillInterjectInGroupConversationsWithoutBeingDirectlyAddressed', 'Controls how often this character will interject in group conversations without being directly addressed.')}
                                </p>
                             </div>

                             <div className="space-y-4">
                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1 text-shadow-sm">{t('creatorsNotes', 'Creator\'s Notes')}</label>
                                {proposedChanges.creator_notes ? (
                                    <DiffViewerComponent field="creator_notes" original={formData.creator_notes} proposed={proposedChanges.creator_notes} />
                                ) : (
                                    <textarea
                                        value={formData.creator_notes}
                                        onChange={(e) => handleChange("creator_notes", e.target.value)}
                                        rows={5}
                                        className="w-full bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all custom-scrollbar resize-none leading-relaxed font-mono"
                                        placeholder={t('personalNotesAboutThisCharacter', 'Personal notes about this character...')}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {activeSection === "description" && (
                        <div className="space-y-4 h-full flex flex-col">
                            <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1 text-shadow-sm">{t('coreDescription', 'Core Description')}</label>
                            {proposedChanges.description ? (
                                <DiffViewerComponent field="description" original={formData.description} proposed={proposedChanges.description} />
                            ) : (
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => handleChange("description", e.target.value)}
                                    className="w-full flex-1 bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all custom-scrollbar min-h-[400px] resize-none leading-relaxed"
                                    placeholder={t('describePhysicalAppearanceHistoryAndDefiningTraits', 'Describe physical appearance, history, and defining traits...')}
                                />
                            )}
                        </div>
                    )}

                    {activeSection === "personality" && (
                        <div className="space-y-4 h-full flex flex-col">
                            <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1 text-shadow-sm">{t('personalityTraits', 'Personality Traits')}</label>
                            {proposedChanges.personality ? (
                                <DiffViewerComponent field="personality" original={formData.personality} proposed={proposedChanges.personality} />
                            ) : (
                                <textarea
                                    value={formData.personality}
                                    onChange={(e) => handleChange("personality", e.target.value)}
                                    className="w-full flex-1 bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all custom-scrollbar min-h-[400px] resize-none leading-relaxed font-mono"
                                    placeholder={t('egSnarkyLoyalSecretiveOrUseWFormat', 'e.g. snarky, loyal, secretive... or use W++ format')}
                                />
                            )}
                        </div>
                    )}

                    {activeSection === "scenario" && (
                        <div className="space-y-4 h-full flex flex-col">
                            <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1 text-shadow-sm">{t('currentScenario', 'Current Scenario')}</label>
                            {proposedChanges.scenario ? (
                                <DiffViewerComponent field="scenario" original={formData.scenario} proposed={proposedChanges.scenario} />
                            ) : (
                                <textarea
                                    value={formData.scenario}
                                    onChange={(e) => handleChange("scenario", e.target.value)}
                                    className="w-full flex-1 bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all custom-scrollbar min-h-[400px] resize-none leading-relaxed"
                                    placeholder={t('defineTheCurrentSituationOrWorldState', 'Define the current situation or world state...')}
                                />
                            )}
                        </div>
                    )}

                    {activeSection === "examples" && (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider text-shadow-sm">{t('exampleDialogue', 'Example Dialogue')}</label>
                                <span className="text-[10px] text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded">{t('useLtstartgtBetweenBlocks', 'Use &lt;START&gt; between blocks')}</span>
                            </div>
                            {proposedChanges.mes_example ? (
                                <DiffViewerComponent field="mes_example" original={formData.mes_example} proposed={proposedChanges.mes_example} />
                            ) : (
                                <textarea
                                    value={formData.mes_example}
                                    onChange={(e) => handleChange("mes_example", e.target.value)}
                                    className="w-full flex-1 bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all custom-scrollbar min-h-[400px] resize-none leading-relaxed font-mono"
                                    placeholder={t('startUserHelloCharSmilesWelcomeToTheTavern', '<START>\n{{user}}: Hello!\n{{char}}: *smiles* Welcome to the tavern!')}
                                />
                            )}
                        </div>
                    )}

                    {activeSection === "greetings" && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1 text-shadow-sm">{t('mainGreeting', 'Main Greeting')}</label>
                                {proposedChanges.first_mes ? (
                                    <DiffViewerComponent field="first_mes" original={formData.first_mes} proposed={proposedChanges.first_mes} />
                                ) : (
                                    <textarea
                                        value={formData.first_mes}
                                        onChange={(e) => handleChange("first_mes", e.target.value)}
                                        rows={6}
                                        className="w-full bg-gray-900 border border-white/10 rounded-3xl px-6 py-5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all custom-scrollbar resize-none leading-relaxed"
                                        placeholder={t('theVeryFirstMessageTheCharacterSays', 'The very first message the character says...')}
                                    />
                                )}
                            </div>
                            
                            <div className="pt-6 border-t border-white/5 space-y-4">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider text-shadow-sm">{t('alternateGreetings', 'Alternate Greetings')}</label>
                                    <button onClick={() => setAlts([...alts, ""])} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-xl text-[10px] font-bold transition uppercase tracking-wider">
                                        <Plus size={14}/> {t('addVariant', 'Add Variant')}
                                    </button>
                                </div>
                                {proposedChanges.alternate_greetings ? (
                                    <DiffViewerComponent 
                                        field="alternate_greetings" 
                                        original={alts.length > 0 ? alts.map((a, i) => `[#${i+1}] ${a}`).join("\n\n") : ""} 
                                        proposed={(() => {
                                            try {
                                                const parsed = JSON.parse(proposedChanges.alternate_greetings!);
                                                return Array.isArray(parsed) ? parsed.map((a: string, i: number) => `[#${i+1}] ${a}`).join("\n\n") : proposedChanges.alternate_greetings!;
                                            } catch {
                                                return proposedChanges.alternate_greetings!;
                                            }
                                        })()} 
                                    />
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {alts.map((alt, i) => (
                                            <div key={i} className="group relative">
                                                <textarea 
                                                    value={alt} 
                                                    onChange={e => {
                                                        const n = [...alts];
                                                        n[i] = e.target.value;
                                                        setAlts(n);
                                                    }}
                                                    rows={3}
                                                    className="w-full bg-gray-900/60 border border-white/10 rounded-2xl px-5 py-4 pr-12 text-sm text-gray-300 focus:outline-none focus:border-indigo-500 transition-all custom-scrollbar resize-none"
                                                    placeholder={t('alternateGreetingVal', 'Alternate Greeting #{{val}}', { val: i+2 })}
                                                />
                                                <button onClick={() => setAlts(alts.filter((_, idx) => idx !== i))} className="absolute top-3 right-3 p-2 bg-gray-800/80 hover:bg-red-900/40 text-gray-500 hover:text-red-400 rounded-lg transition md:opacity-0 group-hover:opacity-100 shadow-lg">
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                        ))}
                                        {alts.length === 0 && (
                                            <div className="text-center py-10 bg-gray-900/20 border-2 border-dashed border-white/5 rounded-3xl text-gray-600 text-xs font-medium">
                                                {t('noAlternateGreetingsDefined', 'No alternate greetings defined.')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeSection === "janitor" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="p-6 bg-gray-900/50 rounded-3xl border border-white/5 space-y-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Bot className="text-indigo-400" />
                                    <span>Janitor.ai Shadow Proxy</span>
                                </h3>
                                
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    {t('janitorProxyDescription', 'This feature allows you to fetch hidden lorebooks and World Info from Janitor.ai bots dynamically as you chat. Note: You must configure your Janitor session cookie in the main Settings tab.')}
                                </p>

                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div>
                                        <div className="text-sm font-bold text-white">{t('enableShadowProxy', 'Enable Shadow Proxy')}</div>
                                        <div className="text-xs text-gray-400">{t('shadowProxySubtext', 'Forward prompts to Janitor to parse hidden World Info')}</div>
                                    </div>
                                    <button
                                        onClick={() => setJanitorShadowEnabled(!janitorShadowEnabled)}
                                        className={`w-14 h-8 rounded-full transition-all duration-300 relative ${
                                            janitorShadowEnabled ? "bg-indigo-600" : "bg-gray-800"
                                        }`}
                                    >
                                        <div
                                            className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-all duration-300 ${
                                                janitorShadowEnabled ? "left-7" : "left-1"
                                            }`}
                                        />
                                    </button>
                                </div>

                                {janitorShadowEnabled && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1">
                                                    {t('janitorCharacterIdLabel', 'Janitor Character ID or URL')}
                                                </label>
                                                <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
                                                    {t('autoExtractUrl', 'Auto-extracts from URL')}
                                                </span>
                                            </div>
                                            <input
                                                value={janitorCharacterId}
                                                onChange={(e) => {
                                                    let val = e.target.value.trim();
                                                    // Auto-extract UUID from full URL e.g. https://janitorai.com/characters/127ef147-4d33-4cca-b373-56e533e9440b_character-name
                                                    const uuidMatch = val.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                                                    if (uuidMatch) {
                                                        val = uuidMatch[1];
                                                    }
                                                    setJanitorCharacterId(val);
                                                }}
                                                className="w-full bg-gray-900 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                                placeholder={t('janitorCharIdPlaceholder', 'Paste URL or UUID (e.g. 127ef147-4d33-4cca-b373-56e533e9440b)')}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1">
                                                    {t('janitorChatIdLabel', 'Janitor Chat ID or URL')}
                                                </label>
                                                <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
                                                    {t('autoExtractUrl', 'Auto-extracts from URL')}
                                                </span>
                                            </div>
                                            <input
                                                value={janitorChatId}
                                                onChange={(e) => {
                                                    let val = e.target.value.trim();
                                                    // Auto-extract chat ID from full URL e.g. https://janitorai.com/chats/669592015
                                                    const chatMatch = val.match(/chats\/([0-9a-zA-Z_-]+)/);
                                                    if (chatMatch) {
                                                        val = chatMatch[1];
                                                    }
                                                    setJanitorChatId(val);
                                                }}
                                                className="w-full bg-gray-900 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                                placeholder={t('janitorChatIdPlaceholder', 'Paste Chat URL or ID (e.g. 669592015)')}
                                            />
                                            <p className="text-[11px] text-gray-500 ml-1">
                                                {t('janitorChatIdSubtext', 'The ID or URL of the shadow chat with this bot on Janitor.ai. Must exist in your Janitor account.')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>

        {/* RIGHT ASSISTANT PANEL */}
        <aside className={`${isMobile ? `fixed top-[calc(4rem+env(safe-area-inset-top))] bottom-[env(safe-area-inset-bottom)] right-0 z-40 w-full bg-gray-950 transform transition-transform duration-300 ${showAssistant ? 'translate-x-0' : 'translate-x-[100%]'}` : `${showAssistant ? 'w-96' : 'hidden'} border-l border-white/5 bg-gray-900/30`} flex flex-col z-10 shadow-2xl transition-all duration-300`}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gray-800/20">
                <div className="flex items-center gap-3">
                    <Sparkles size={18} className="text-amber-400 animate-pulse" />
                    <span className="text-sm font-bold tracking-tight">
                        {t('studioAssistant', 'Studio Assistant')} <span className="text-[10px] text-amber-500/50 ml-1">(BETA)</span>
                    </span>
                </div>
                <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-[10px] font-bold text-gray-400 transition cursor-pointer">
                    <History size={12} /> {showHistory ? t('backToChat', 'Back to Chat') : t('history', 'History')}
                </button>
            </div>
            
            {showHistory ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gray-950/20">
                    <div className="flex gap-2">
                        <button onClick={saveStudioChat} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                            <Save size={14} /> {t('saveCurrentChat', 'Save Current Chat')}
                        </button>
                        <button 
                            onClick={() => {
                                if (confirm("Start a new chat? The current conversation will be cleared from this screen.")) {
                                    setAssistantMessages([
                                        { role: 'assistant', content: t('helloIAmYourAiStudioAssistantICanHelpYouImproveYourCharacterCardTryAskingMeToMakeTheDescriptionMoreDetailedOrSuggestSomeSnarkyPersonalityTraits', 'Hello! I am your AI Studio Assistant. I can help you improve your character card. Try asking me to \'make the description more detailed\' or \'suggest some snarky personality traits\'.') }
                                    ]);
                                    setCurrentStudioChatId(null);
                                    setEditingMsgIndex(null);
                                    setShowHistory(false);
                                }
                            }} 
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition shadow-lg border border-white/5"
                        >
                            <Plus size={14} /> {t('newChat', 'New Chat')}
                        </button>
                    </div>
                    <div className="space-y-2 mt-4">
                        {savedChats.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 text-xs italic">{t('noSavedChats', 'No saved chats.')}</div>
                        ) : (
                            savedChats.map(chat => (
                                <div key={chat.id} className="p-3 bg-gray-900 border border-white/5 rounded-xl cursor-pointer hover:bg-gray-800 transition group relative">
                                    <div onClick={() => loadStudioChat(chat)}>
                                        <div className="text-xs font-bold text-gray-300 pr-6">{chat.title}</div>
                                        <div className="text-[10px] text-gray-500 mt-1">{new Date(chat.date).toLocaleString()}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteStudioChat(chat.id); }} className="absolute top-2 right-2 p-1.5 text-red-400 md:opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <>
                <div 
                    id="assistant-chat-history"
                    className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-950/20"
                >
                {assistantMessages.map((msg, i) => (
                    <div key={i} className={`flex items-center gap-2 group/msg ${msg.role === 'user' ? 'justify-end flex-row-reverse' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm relative ${
                            msg.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                            : 'bg-gray-800 text-gray-200 border border-white/5 rounded-tl-none'
                        }`}>
                            {msg.images && msg.images.length > 0 && (
                                <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                                    {msg.images.map((img, j) => (
                                        <img key={j} src={img} alt="attached" className="h-16 rounded-md object-cover border border-white/10" />
                                    ))}
                                </div>
                            )}
                            {editingMsgIndex === i ? (
                                <div className="space-y-2 w-full min-w-[200px]">
                                    <textarea
                                        value={editMsgContent}
                                        onChange={(e) => setEditMsgContent(e.target.value)}
                                        className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 custom-scrollbar resize-none min-h-[60px]"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => setEditingMsgIndex(null)}
                                            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[10px] font-bold text-gray-400 transition"
                                        >
                                            {t('cancel', 'Cancel')}
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const updated = [...assistantMessages];
                                                updated[i].content = editMsgContent;
                                                setAssistantMessages(updated);
                                                setEditingMsgIndex(null);
                                            }}
                                            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white transition flex items-center gap-1"
                                        >
                                            <Check size={10} /> {t('save', 'Save')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    className="prose prose-sm max-w-none break-words overflow-x-auto prose-invert [&_p]:mb-2 last:[&_p]:mb-0 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }}
                                />
                            )}
                        </div>
                        {editingMsgIndex !== i && (
                            <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex gap-1 items-center shrink-0">
                                <button 
                                    onClick={() => {
                                        setEditingMsgIndex(i);
                                        setEditMsgContent(msg.content);
                                    }}
                                    className="p-1 hover:bg-gray-800 text-gray-500 hover:text-gray-300 rounded transition"
                                    title="Edit message"
                                >
                                    <Edit size={12} />
                                </button>
                                <button 
                                    onClick={() => {
                                        if (confirm("Delete this message?")) {
                                            setAssistantMessages(prev => prev.filter((_, idx) => idx !== i));
                                        }
                                    }}
                                    className="p-1 hover:bg-gray-800 text-gray-500 hover:text-red-400 rounded transition"
                                    title="Delete message"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {isAssistantThinking && (
                    <div className="flex justify-start animate-pulse">
                        <div className="bg-gray-800 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none flex gap-1">
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" />
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        </div>
                    </div>
                )}
                </div>

                {/* Quick Action Bar */}
                <div className="px-4 py-3 bg-black/20 border-t border-white/5">
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        <button 
                            onClick={() => sendAssistantMessage("Improve the character description to be more vivid and immersive.")}
                            className="whitespace-nowrap px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-[10px] font-bold text-gray-300 transition border border-white/5"
                        >
                            {t('improveDesc', '? Improve Desc')}
                        </button>
                        <button 
                            onClick={() => sendAssistantMessage("Analyze my personality block and suggest 3 more distinct traits.")}
                            className="whitespace-nowrap px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-[10px] font-bold text-gray-300 transition border border-white/5"
                        >
                            {t('suggestTraits', '? Suggest Traits')}
                        </button>
                        <button 
                            onClick={() => sendAssistantMessage("Write a catchy first message for this character based on the current scenario.")}
                            className="whitespace-nowrap px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-[10px] font-bold text-gray-300 transition border border-white/5"
                        >
                            {t('genGreeting', '? Gen Greeting')}
                        </button>
                    </div>
                </div>

            {/* Assistant Input */}
            <div className="p-4 bg-gray-900/50 border-t border-white/10 space-y-2">
                {attachedImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {attachedImages.map((img, i) => (
                            <div key={i} className="relative group shrink-0">
                                <img src={img} alt="attachment" className="h-12 rounded-lg border border-white/20 object-cover" />
                                <button onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 md:opacity-0 group-hover:opacity-100 transition scale-75 shadow-sm">
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="relative flex items-center gap-2">
                    <label className="shrink-0 p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl cursor-pointer transition">
                        <Image size={16} />
                        <input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={(e) => {
                                if (e.target.files) {
                                    Array.from(e.target.files).forEach(file => {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            if (ev.target?.result) setAttachedImages(prev => [...prev, ev.target!.result as string]);
                                        };
                                        reader.readAsDataURL(file);
                                    });
                                }
                                e.target.value = '';
                            }} 
                        />
                    </label>
                    <textarea 
                        value={assistantInput}
                        onChange={(e) => setAssistantInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendAssistantMessage();
                            }
                        }}
                        placeholder={t('askTheAssistant', 'Ask the Assistant...')}
                        className="w-full bg-gray-950 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none h-12 custom-scrollbar"
                    />
                    <button 
                        onClick={() => sendAssistantMessage()}
                        disabled={isAssistantThinking || (!assistantInput.trim() && attachedImages.length === 0)}
                        className="absolute bottom-1 right-1 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition shadow-lg"
                    >
                        <Sparkles size={16} />
                    </button>
                </div>
            </div>
            </>
            )}
        </aside>

      </div>
    </div>
  );
};

