import { useState, useEffect } from "react";
import { 
  X, Image, Cpu, Plus, Trash2, Download, Save, 
  Book, MessageSquare, Sparkles, ChevronRight,
  UserCircle, History,
  Layout, Type, MessageCircle, Menu, Bot
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../Avatar";
import { Character } from "../../types";
import { useTranslation } from 'react-i18next'

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

type EditorSection = "general" | "description" | "personality" | "scenario" | "examples" | "greetings";

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
  const [activeSection, setActiveSection] = useState<EditorSection>("general");
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showAssistant, setShowAssistant] = useState(!isMobile);
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: t('helloIAmYourAiStudioAssistantICanHelpYouImproveYourCharacterCardTryAskingMeToMakeTheDescriptionMoreDetailedOrSuggestSomeSnarkyPersonalityTraits', 'Hello! I am your AI Studio Assistant. I can help you improve your character card. Try asking me to \'make the description more detailed\' or \'suggest some snarky personality traits\'.') }
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [proposedChanges, setProposedChanges] = useState<Record<string, string | null>>({});

  const scrollToBottom = () => {
    const chatContainer = document.getElementById("assistant-chat-history");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [assistantMessages]);

  const sendAssistantMessage = async (manualInput?: string) => {
    const input = manualInput || assistantInput;
    if (!input.trim() || isAssistantThinking) return;

    const newMsgs = [...assistantMessages, { role: 'user' as const, content: input }];
    setAssistantMessages(newMsgs);
    setAssistantInput("");
    setIsAssistantThinking(true);

    try {
      const activeProfile = localStorage.getItem("active_profile") || "Default";
      const activePreset = localStorage.getItem("active_preset") || "Default";
      
      const studioSystemPrompt = `You are the TavernRev AI Character Studio Assistant. Your goal is to help users craft high-quality AI characters.\nWhen suggesting changes to specific character card fields, you MUST use the following XML tags:\n<change field="description">New improved content</change>\n\nSupported fields: name, description, personality, scenario, first_mes, mes_example, creator_notes.\n\nCurrent Character State:\n- Name: ${formData.name}\n- Description: ${formData.description}\n- Personality: ${formData.personality}\n- Scenario: ${formData.scenario}\n- First Message: ${formData.first_mes}\n- Message Examples: ${formData.mes_example}\n- Creator Notes: ${formData.creator_notes}\n\nAlways explain WHAT you are changing and WHY before or after the tags. Be creative, consistent, and adhere to the character's core concept.`;

      const response = await invoke<string>("studio_assist", {
        profileName: activeProfile,
        presetName: activePreset,
        messages: [
            { role: 'system', content: studioSystemPrompt },
            ...newMsgs.slice(-5)
        ]
      });

      const changeRegex = /<change\s+field="([^"]+)">([\s\S]*?)<\/change>/gi;
      let match;
      const newProposed = { ...proposedChanges };
      while ((match = changeRegex.exec(response)) !== null) {
        newProposed[match[1]] = match[2].trim();
      }
      
      setProposedChanges(newProposed);
      setAssistantMessages([...newMsgs, { role: 'assistant', content: response }]);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setIsAssistantThinking(false);
    }
  };

  const applyChange = (field: string) => {
    const content = proposedChanges[field];
    if (content) {
      handleChange(field as keyof Character, content);
      setProposedChanges(prev => ({ ...prev, [field]: null }));
      addToast(`Applied changes to ${field}`, "success");
    }
  };

  const rejectChange = (field: string) => {
    setProposedChanges(prev => ({ ...prev, [field]: null }));
  };

  const DiffViewer = ({ field, original, proposed }: { field: string, original: string, proposed: string }) => {
    // Simple line-level diff for better UX
    const oldLines = (original || "").split('\n');
    const newLines = (proposed || "").split('\n');
    const diffElements = [];

    let i = 0; let j = 0;
    while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            if (oldLines[i].trim()) {
                diffElements.push(<div key={`eq-${i}-${j}`} className="px-4 py-1 opacity-50 text-gray-400 whitespace-pre-wrap">{oldLines[i]}</div>);
            }
            i++; j++;
        } else {
            // Find next match to resync (lookahead window)
            let nextI = i; let nextJ = j; let found = false;
            for (let lookI = i; lookI < Math.min(oldLines.length, i + 8) && !found; lookI++) {
                for (let lookJ = j; lookJ < Math.min(newLines.length, j + 8) && !found; lookJ++) {
                    if (oldLines[lookI] === newLines[lookJ] && oldLines[lookI].trim()) {
                        nextI = lookI; nextJ = lookJ; found = true;
                    }
                }
            }
            if (!found) {
                if (i < oldLines.length) {
                    if (oldLines[i].trim()) diffElements.push(<div key={`del-${i}`} className="px-4 py-1.5 bg-red-500/10 line-through decoration-red-500/50 text-red-300 whitespace-pre-wrap border-y border-red-500/10 my-0.5">{oldLines[i]}</div>);
                    i++;
                }
                if (j < newLines.length) {
                    if (newLines[j].trim()) diffElements.push(<div key={`add-${j}`} className="px-4 py-1.5 bg-emerald-500/10 text-emerald-200 whitespace-pre-wrap shadow-[inset_2px_0_0_rgba(16,185,129,0.5)] my-0.5">{newLines[j]}</div>);
                    j++;
                }
            } else {
                while (i < nextI) {
                    if (oldLines[i].trim()) diffElements.push(<div key={`del-${i}`} className="px-4 py-1.5 bg-red-500/10 line-through decoration-red-500/50 text-red-300 whitespace-pre-wrap border-y border-red-500/10 my-0.5">{oldLines[i]}</div>);
                    i++;
                }
                while (j < nextJ) {
                    if (newLines[j].trim()) diffElements.push(<div key={`add-${j}`} className="px-4 py-1.5 bg-emerald-500/10 text-emerald-200 whitespace-pre-wrap shadow-[inset_2px_0_0_rgba(16,185,129,0.5)] my-0.5">{newLines[j]}</div>);
                    j++;
                }
            }
        }
    }

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
                <div className="bg-gray-900 rounded-[22px] overflow-hidden text-sm leading-relaxed py-2">
                    {diffElements.length > 0 ? diffElements : <div className="p-4 text-gray-500 italic text-center">{t('noVisualTextDifferences', 'No visual text differences.')}</div>}
                </div>
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
  ];

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 animate-in fade-in duration-500 overflow-hidden">
      {/* HEADER */}
      <header className="h-16 shrink-0 border-b border-white/10 bg-gray-900/50 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 z-20">
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
        <aside className={`${isMobile ? `fixed inset-y-16 left-0 z-30 w-64 bg-gray-900 border-r border-white/10 shadow-2xl transform transition-transform duration-300 ${showMobileNav ? 'translate-x-0' : 'translate-x-[-100%]'}` : 'w-64 border-r border-white/5 bg-gray-950/50 flex flex-col'}`}>
            <nav className="p-4 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-4">{t('studioNavigator', 'Studio Navigator')}</div>
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id as EditorSection)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${activeSection === s.id ? 'bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    >
                        <div className="flex items-center gap-3">
                            <span className={activeSection === s.id ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}>{s.icon}</span>
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
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto p-4 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    
                    {activeSection === "general" && (
                        <div className="space-y-8">
                             <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="relative group cursor-pointer shrink-0 mx-auto md:mx-0">
                                    <Avatar src={formData.avatar} name={formData.name} size="xl" />
                                    <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 border-2 border-dashed border-indigo-500/50">
                                        <Image size={32} className="text-white animate-bounce" />
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">{t('changePhoto', 'CHANGE PHOTO')}</div>
                                </div>
                                <div className="flex-1 space-y-6 w-full">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider ml-1">{t('characterName', 'Character Name')}</label>
                                        {proposedChanges.name ? (
                                            <DiffViewer field="name" original={formData.name} proposed={proposedChanges.name} />
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
                                    <DiffViewer field="creator_notes" original={formData.creator_notes} proposed={proposedChanges.creator_notes} />
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
                                <DiffViewer field="description" original={formData.description} proposed={proposedChanges.description} />
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
                                <DiffViewer field="personality" original={formData.personality} proposed={proposedChanges.personality} />
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
                                <DiffViewer field="scenario" original={formData.scenario} proposed={proposedChanges.scenario} />
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
                                <DiffViewer field="mes_example" original={formData.mes_example} proposed={proposedChanges.mes_example} />
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
                                    <DiffViewer field="first_mes" original={formData.first_mes} proposed={proposedChanges.first_mes} />
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
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>

        {/* RIGHT ASSISTANT PANEL */}
        <aside className={`${isMobile ? `fixed inset-y-16 right-0 z-40 w-full bg-gray-950 transform transition-transform duration-300 ${showAssistant ? 'translate-x-0' : 'translate-x-[100%]'}` : `${showAssistant ? 'w-96' : 'hidden'} border-l border-white/5 bg-gray-900/30`} flex flex-col z-10 shadow-2xl transition-all duration-300`}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gray-800/20">
                <div className="flex items-center gap-3">
                    <Sparkles size={18} className="text-amber-400 animate-pulse" />
                    <span className="text-sm font-bold tracking-tight">
                        {t('studioAssistant', 'Studio Assistant')} <span className="text-[10px] text-amber-500/50 ml-1">(BETA)</span>
                    </span>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-400 uppercase">{t('liveContext', 'Live Context')}</div>
            </div>
            
            {/* Assistant Chat History */}
            <div 
                id="assistant-chat-history"
                className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-950/20"
            >
                {assistantMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                            : 'bg-gray-800 text-gray-200 border border-white/5 rounded-tl-none'
                        }`}>
                            {msg.content}
                        </div>
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
            <div className="p-4 bg-gray-900/50 border-t border-white/10">
                <div className="relative">
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
                        className="w-full bg-gray-950 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none h-20 custom-scrollbar"
                    />
                    <button 
                        onClick={() => sendAssistantMessage()}
                        disabled={isAssistantThinking || !assistantInput.trim()}
                        className="absolute bottom-3 right-3 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition shadow-lg"
                    >
                        <Sparkles size={16} />
                    </button>
                </div>
            </div>
        </aside>

      </div>
    </div>
  );
};

