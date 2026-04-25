import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Menu,
  Play,
  Settings as SettingsIcon,
  Pencil,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Trash2,
  Activity,
  UserCircle,
  Download,
  CloudUpload,
  Check,
  X,
  FilePlus,
  Plus,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import showdown from "showdown";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import Settings from "./Settings";
import Avatar from "./components/Avatar";
import PersonaEditor from "./components/PersonaEditor";
import { AutoResizeTextarea } from "./components/AutoResizeTextarea";
import { ToastContainer, ToastMessage, ToastType } from "./components/Toast";
import { Character, UserPersona, Chat, Message, ChatStats, Group, QuickReply } from "./types";
import { GroupSelect } from "./components/GroupSelect";
import { GroupEditor } from "./components/GroupEditor";
import { StatsModal } from "./components/chat/StatsModal";
import { CharacterEditor } from "./components/character/CharacterEditor";
import { CharacterSelect } from "./components/character/CharacterSelect";
import { MessageInput } from "./components/chat/MessageInput";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatMemoryModal } from "./components/ChatMemoryModal";
import { TavernAPI } from "./services/PluginAPI";
import { logger } from "./services/Logger";
import "./App.css";

const getRagConfig = () => ({
  enabled: localStorage.getItem("rag_enabled") === "true",
  top_k: parseInt(localStorage.getItem("rag_top_k") || "3"),
  threshold: parseFloat(localStorage.getItem("rag_threshold") || "0.5"),
  injection_depth: parseInt(localStorage.getItem("rag_injection_depth") || "0"),
  template: localStorage.getItem("rag_template") || "[System Note: Relevant context from past memory:\n{{text}}\n]"
});

const converter = new showdown.Converter({
  simpleLineBreaks: true,
  strikethrough: true,
  tables: true,
  emoji: true,
  parseImgDimensions: true,
  openLinksInNewWindow: true,
  extensions: [
      {
          type: 'lang',
          filter: (text: string) => {
              // 1. HR Styling
              text = text.replace(/^---$/gm, '<hr class="my-6 border-white/10" />');
              // 2. Dialogue Highlighting (Teal-300) - safe vs markdown links
              text = text.replace(/(?<!\]\()(?<!=\s*)"([^"]+)"/g, '<span class="text-teal-300">"$1"</span>');
              text = text.replace(/«([^»]+)»/g, '<span class="text-teal-300">«$1»</span>');
              return text;
          }
      },
      {
          type: 'output',
          filter: (text: string) => {
              // Auto-render image links (e.g. Catbox)
              return text.replace(/<a href="(https?:\/\/[^"]+\.(?:png|jpg|jpeg|gif|webp|bmp))"[^>]*>.*?<\/a>/gi, (_match, url) => {
                  return `<img src="${url}" class="max-w-full max-h-[500px] rounded-lg my-2 border border-white/10 shadow-lg object-contain" alt="Remote Image" />`;
              });
          }
      }
  ],
});

interface StreamPayload {
  content: string;
  gen_id: number;
  target_id: number | null;
}

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

const reasoningTags = new Set(["think", "thinking", "reasoning"]);
const pairedTagRegex = /<([a-z][\w:-]*)>([\s\S]*?)(?:<\/\1>|$)/gi;

function renderMessageHtml(content: string) {
    const mathMap = new Map<string, string>();
    let html = converter.makeHtml(
        content.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
            try {
                const rendered = katex.renderToString(formula, { displayMode: true, throwOnError: false });
                const token = `KATEXBLOCK${Math.random().toString(36).slice(2, 11)}`;
                mathMap.set(token, rendered);
                return token;
            } catch {
                return match;
            }
        }).replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
            try {
                const rendered = katex.renderToString(formula, { displayMode: false, throwOnError: false });
                const token = `KATEXINLINE${Math.random().toString(36).slice(2, 11)}`;
                mathMap.set(token, rendered);
                return token;
            } catch {
                return match;
            }
        })
    );

    mathMap.forEach((val, key) => {
        html = html.replace(key, val);
    });

    return DOMPurify.sanitize(html, {
        ADD_TAGS: ['img', 'a', 'style', 'memo', 'small', 'q', 'center', 'big', 'font', 'blockquote', 'hr', 'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'annotation', 'semantics', 'svg', 'path', 'line', 'rect', 'circle', 'polygon', 'polyline', 'ellipse', 'button', 'details', 'summary', 'input', 'label', 'select', 'option', 'meter', 'progress', 'dialog'],
        ADD_ATTR: ['src', 'href', 'target', 'alt', 'title', 'style', 'class', 'id', 'color', 'size', 'face', 'width', 'height', 'xmlns', 'display', 'viewBox', 'd', 'fill', 'stroke', 'preserveAspectRatio', 'aria-hidden', 'data-command', 'type', 'checked', 'selected', 'value', 'name', 'for', 'min', 'max', 'step', 'open', 'role', 'aria-label', 'aria-expanded'],
    });
}

// --- COMPONENTS ---

const MessageContent = React.memo(({ content, isUser, scale, userName, charName, images }: { content: string, isUser: boolean, scale?: number, userName?: string, charName?: string, images?: string[] }) => {
    // Replace visual macros
    let finalContent = content;
    if (userName) finalContent = finalContent.replace(/{{user}}/gi, userName);
    if (charName) finalContent = finalContent.replace(/{{char}}/gi, charName);
    
    // Fix Showdown HR/Header bug (Ensure --- is treated as HR, not Header, to avoid quote parsing issues)
    // Replace markdown HR with HTML HR to avoid parser confusion with quotes
    finalContent = finalContent.replace(/^---$/gm, "\n<hr class='my-4 border-white/10' />\n");

    const reasoningParts: string[] = [];
    const hiddenTagParts: Array<{ tag: string; content: string }> = [];
    let cleanContent = finalContent;

    if (!isUser) {
        cleanContent = finalContent.replace(pairedTagRegex, (_match, tagName, innerContent) => {
            const trimmed = String(innerContent).trim();
            if (!trimmed) return "";

            const normalizedTag = String(tagName).toLowerCase();
            if (reasoningTags.has(normalizedTag)) {
                reasoningParts.push(trimmed);
                return "";
            }

            hiddenTagParts.push({ tag: normalizedTag, content: trimmed });
            return "";
        }).trim();
    }

    const hasReasoning = reasoningParts.length > 0;
    const reasoning = reasoningParts.join("\n\n---\n\n");

    const style = scale ? { fontSize: `${scale}em` } : {};
    const html = renderMessageHtml(cleanContent);

    return (
        <div className="flex flex-col gap-2 min-w-0" style={style}>
            {images && images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {images.map((img, i) => (
                        <img key={i} src={img} className="max-w-full max-h-96 rounded-lg border border-white/10 object-contain" alt="User upload" />
                    ))}
                </div>
            )}
            {hasReasoning && (
                <details className="bg-gray-950/30 rounded-lg border border-white/5 overflow-hidden group/think open:bg-gray-950/50 mb-1">
                    <summary className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer hover:bg-white/5 hover:text-gray-300 transition select-none flex items-center gap-2 outline-none list-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 group-open/think:bg-indigo-400 group-open/think:shadow-[0_0_8px_rgba(129,140,248,0.6)] transition-all"/>
                        Reasoning Process
                    </summary>
                    <div className="p-3 text-xs text-gray-400 font-mono whitespace-pre-wrap border-t border-white/5 bg-black/20 selection:bg-indigo-500/20 leading-relaxed">
                        {reasoning}
                    </div>
                </details>
            )}
            {hiddenTagParts.map((part, index) => (
                <details key={`${part.tag}-${index}`} className="bg-gray-950/30 rounded-lg border border-white/5 overflow-hidden open:bg-gray-950/50 mb-1">
                    <summary className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer hover:bg-white/5 hover:text-gray-300 transition select-none outline-none list-none">
                        {part.tag}
                    </summary>
                    <div
                        className="prose prose-sm prose-invert max-w-none break-words overflow-x-auto [&_p]:mb-4 last:[&_p]:mb-0 p-3 border-t border-white/5 bg-black/20"
                        dangerouslySetInnerHTML={{ __html: renderMessageHtml(part.content) }}
                    />
                </details>
            ))}
            <div 
                className={`prose prose-sm max-w-none break-words overflow-x-auto [&_p]:mb-4 last:[&_p]:mb-0 ${isUser ? 'prose-invert text-white' : 'prose-invert text-gray-100'}`}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
});

function App() {
  const [currentView, setCurrentView] = useState<
    "character_select" | "chat" | "settings"
  >("character_select");
  const [selectMode, setSelectMode] = useState<"characters" | "groups">("characters");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<number | null>(
    null,
  );
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [userPersonas, setUserPersonas] = useState<UserPersona[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [contentScale, setContentScale] = useState(() => parseFloat(localStorage.getItem("ui_content_scale") || "1.0"));
  const [chatStyle, setChatStyle] = useState<"bubbles" | "document">(() => (localStorage.getItem("ui_chat_style") as "bubbles" | "document") || "bubbles");
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQR, setShowQR] = useState(false);
  
  // Auto-Retry Settings
  const [retryEnabled, setRetryEnabled] = useState(localStorage.getItem("retry_enabled") === "true");
  const [retryTriggers, setRetryTriggers] = useState(localStorage.getItem("retry_triggers") || "429, 503, 500, overloaded, capacity");
  const [retryDelay, setRetryDelay] = useState(parseInt(localStorage.getItem("retry_delay") || "3"));
  const retryTimeoutRef = useRef<number | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showInputMenu, setShowInputMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationIdRef = useRef(0);

  useEffect(() => {
      localStorage.setItem("retry_enabled", retryEnabled.toString());
      localStorage.setItem("retry_triggers", retryTriggers);
      localStorage.setItem("retry_delay", retryDelay.toString());
  }, [retryTriggers, retryDelay, retryEnabled]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [popupContent, setPopupContent] = useState<string | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");

  const dataChangedRef = useRef(false);
  const markDataChanged = useCallback(() => {
      dataChangedRef.current = true;
  }, []);

  const syncChatDebounceRef = useRef<number | null>(null);
  const triggerAutoSync = (chatId: number) => {
      const autoSyncEnabled = localStorage.getItem("cloud_auto_sync") !== "false";
      const isSyncActive = localStorage.getItem("gdrive_connected") === "true" || localStorage.getItem("dropbox_connected") === "true";
      if (!isSyncActive || !autoSyncEnabled) return;

      if (syncChatDebounceRef.current !== null) {
          window.clearTimeout(syncChatDebounceRef.current);
      }
      
      setAutoSyncStatus("idle"); // reset if typing again

      syncChatDebounceRef.current = window.setTimeout(() => {
          setAutoSyncStatus("syncing");
          invoke("sync_push_chat", { chatId }).then(() => {
              setAutoSyncStatus("success");
              setTimeout(() => setAutoSyncStatus("idle"), 3000);
          }).catch(e => {
              console.error("Auto-sync error:", e);
              setAutoSyncStatus("error");
              setTimeout(() => setAutoSyncStatus("idle"), 5000);
          });
      }, 5000);
  };

  const addToast = (message: string, type: ToastType = "info") => {
    const id = Date.now().toString() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchQuickReplies = async () => {
      try {
          const qrs = await invoke<QuickReply[]>("get_quick_replies");
          setQuickReplies(qrs);
      } catch(e) { console.error(e); }
  };

  useEffect(() => {
      fetchQuickReplies();
  }, []);

  const convertToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
      });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          try {
              const files = Array.from(e.target.files);
              const bases = await Promise.all(files.map(convertToBase64));
              setAttachedImages(prev => [...prev, ...bases]);
          } catch (err) {
              console.error("Failed to read image files:", err);
              addToast("Failed to load image.", "error");
          }
      }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
              const blob = items[i].getAsFile();
              if (blob) {
                  try {
                      const base64 = await convertToBase64(blob);
                      setAttachedImages(prev => [...prev, base64]);
                  } catch (err) {
                      console.error("Failed to paste image:", err);
                      addToast("Failed to paste image.", "error");
                  }
              }
          }
      }
  };
  // UI State
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [chatMemory, setChatMemory] = useState("");
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [regenGreetingModal, setRegenGreetingModal] = useState<number | null>(null);
  const [customRegenNudge, setCustomRegenNudge] = useState("");
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [pendingManualGeneration, setPendingManualGeneration] = useState<((charId: number) => void) | null>(null);
  const [manualGenerationMembers, setManualGenerationMembers] = useState<Character[]>([]);
  const [editingPersona, setEditingPersona] = useState<UserPersona | null>(
    null,
  );
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [modelName, setModelName] = useState("Select Model");
  const [chatStats, setChatStats] = useState<ChatStats | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(localStorage.getItem("active_profile"));
  const [activePresetFile, setActivePresetFile] = useState<string | null>(localStorage.getItem("active_preset"));
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<"default" | "custom" | "character">(() => (localStorage.getItem("ui_bg_mode") as any) || "default");
  const [customBg, setCustomBg] = useState<string | null>(localStorage.getItem("ui_custom_bg"));

  useEffect(() => {
      localStorage.setItem("ui_bg_mode", bgMode);
      if (customBg) localStorage.setItem("ui_custom_bg", customBg);
  }, [bgMode, customBg]);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(
    null,
  );

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Derived State

  const activeChat = chats.find((c) => c.id === activeChatId);

  const activePersona =
    userPersonas.find((p) => p.id === activeChat?.user_persona_id) ||
    userPersonas[0] || { name: "You", avatar: "user_default.png", id: 0, description: "" };

  const activeCharacter = characters.find((c) => c.id === activeCharacterId);
  const activeGroup = groups.find((g) => g.id === activeGroupId);

  // Background Logic
  useEffect(() => {
      if (bgMode === "default") {
          setBgImage(null);
      } else if (bgMode === "custom") {
          setBgImage(customBg);
      } else if (bgMode === "character" && activeCharacter) {
          if (activeCharacter.avatar && activeCharacter.avatar !== "default.png") {
              invoke<string>("read_image_base64", { fileName: activeCharacter.avatar })
                .then(setBgImage)
                .catch(() => setBgImage(null));
          } else {
              setBgImage(null);
          }
      }
  }, [bgMode, customBg, activeCharacter]);

  // --- DATA FETCHING ---

  const fetchModelName = async () => {
    try {
      const profiles = await invoke<string[]>("list_connection_profiles");

      console.log("Profiles:", profiles);

      let targetProfile = localStorage.getItem("active_profile");

      if (!targetProfile || !profiles.includes(targetProfile)) {
        if (profiles.length > 0) targetProfile = profiles[0];
        else {
          setModelName("No Profile");

          return;
        }
      }

      if (targetProfile) {
        const content = await invoke<string>("load_connection_profile", {
          fileName: targetProfile,
        });

        const data = JSON.parse(content);

        console.log("Profile Data:", data);

        if (data.model_id) setModelName(data.model_id);
        else setModelName("Unknown Model");
        
        setActiveProfileName(targetProfile);
      }
    } catch (e) {
      console.error("Failed to load model name:", e);
    }
  };
const refreshCharacters = async () => {
  try {
    console.log("APP: Requesting characters from backend...");
    const chars = await invoke<Character[]>("get_characters");
    console.log(`APP: Received ${chars.length} characters`);
    setCharacters(chars);
    if (chars.length > 0 && !activeCharacterId) {
        setActiveCharacterId(chars[0].id);
    }
    return chars;
  } catch (e) {
    console.error("APP ERROR: Failed to load characters:", e);
    return [];
  }
};

  const refreshGroups = async () => {
    try {
      const grps = await invoke<Group[]>("get_groups");
      console.log(`APP: Received ${grps.length} groups`);
      setGroups(grps);
      return grps;
    } catch (e) {
      console.error("Failed to load groups:", e);
      return [];
    }
  };

  const handleCreateGroup = async (name: string, members: number[]) => {
    try {
      const groupId = await invoke<number>("create_group", {
        name,
        avatar: "",
        scenario: "",
      });
      
      for (const charId of members) {
        await invoke("add_group_member", { groupId: groupId, characterId: charId });
      }
      
      await refreshGroups();
      
      // Automatically enter the new group chat
      setActiveGroupId(groupId);
      setActiveCharacterId(0);
      setActiveChatId(null);
      setMessages([]);
      setCurrentView("chat");
      
      // Open settings for the new group
      setIsEditingGroup(true);
      
      addToast(`Group "${name}" created!`, "success");
    } catch (e) {
      addToast("Failed to create group: " + e, "error");
    }
  };

  const handleDeleteGroup = async (id: number, name: string) => {
    if (confirm(`Delete group "${name}"? This will not delete the characters.`)) {
      try {
        await invoke("delete_group", { id });
        if (activeGroupId === id) {
            setActiveGroupId(null);
            setMessages([]);
        }
        await refreshGroups();
        addToast(`Group ${name} deleted.`, "success");
      } catch (e) {
        addToast("Failed to delete group: " + e, "error");
      }
    }
  };

  const refreshPersonas = async () => {
    try {
      setUserPersonas(await invoke<UserPersona[]>("get_user_personas"));
    } catch (e) {
      console.error(e);
    }
  };

  const refreshChats = useCallback(async (charId: number, groupId: number | null = null) => {
    try {
      const fetched = await invoke<Chat[]>('get_chats', { characterId: charId, groupId });
      setChats(fetched);
      
      const isValid = activeChatId && fetched.some(c => c.id === activeChatId);
      
      if (!isValid) {
          if (fetched.length > 0) {
              setActiveChatId(fetched[0].id);
          } else {
              setActiveChatId(null);
              setMessages([]);
          }
      }
    } catch (e) { console.error(e); }
  }, [activeChatId]);

  const getMsgLimit = () =>
    parseInt(localStorage.getItem("ui_msg_limit") || "50");

  const fetchMessages = useCallback(async (chatId: number) => {
    try {
      const limit = getMsgLimit();

      const newMsgs = await invoke<Message[]>("get_messages_paged", {
        chatId,
        limit,
        offset: 0,
      });

      setMessages(newMsgs);

      setOffset(limit);

      setHasMore(newMsgs.length === limit);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleLoadMore = async () => {
    if (!activeChatId) return;

    const container = chatContainerRef.current;

    const oldHeight = container?.scrollHeight || 0;

    const oldTop = container?.scrollTop || 0;

    const limit = getMsgLimit();

    try {
      const newMsgs = await invoke<Message[]>("get_messages_paged", {
        chatId: activeChatId,
        limit,
        offset,
      });

      if (newMsgs.length > 0) {
        setMessages((prev) => [...newMsgs, ...prev]);

        setOffset((prev) => prev + limit);

        setHasMore(newMsgs.length === limit);

        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - oldHeight + oldTop;
          }
        });
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStats = async () => {
    console.log("Fetching stats...", { activeChatId });

    if (activeChatId === null) {
      alert("Select a chat to view stats.");

      return;
    }

    try {
      const stats = await invoke<ChatStats>("get_chat_stats", {
        chatId: activeChatId,
      });

      console.log("Stats received:", stats);

      setChatStats(stats);

      setShowStatsModal(true);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  };

  // --- ACTIONS ---

  const handleSwitchPersona = async (personaId: number) => {
    if (activeChatId === null) return;

    try {
      await invoke("update_chat_persona", { chatId: activeChatId, personaId });

      await refreshChats(activeCharacterId!);

      setShowPersonaModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const checkContentForErrors = (text: string): boolean => {
      if (!retryEnabled) return false;
      const triggers = retryTriggers.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
      const contentLower = text.toLowerCase();
      return triggers.some(t => contentLower.includes(t));
  };

  const attemptAutoRetry = (errorMsg: string, retryAction: () => void) => {
      if (!retryEnabled) return false;
      const triggers = retryTriggers.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
      const err = errorMsg.toLowerCase();
      
      if (triggers.some(t => err.includes(t))) {
          const currentChatAtError = activeChatId; 
          setIsGenerating(true);
          setIsRetrying(true);
          addToast(`Error detected. Retrying in ${retryDelay}s...`, "info");
          
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          
          const delay = isNaN(retryDelay) ? 3 : retryDelay;
          retryTimeoutRef.current = window.setTimeout(() => {
              retryTimeoutRef.current = null;
              if (activeChatIdRef.current === currentChatAtError) {
                  retryAction();
              } else {
                  setIsRetrying(false);
                  setIsGenerating(false);
              }
          }, delay * 1000);
          return true;
      }
      return false;
  };

  const handleSendMessage = async (manualContent?: string) => {
    if (isGenerating && !isRetrying) return;
    let textToSend = manualContent !== undefined ? manualContent : inputValue;
    
    if (activeChatId === null) return;

    try {
        textToSend = await TavernAPI.emitAsync("before_send_message", textToSend);
    } catch (err) {
        console.error("[PluginAPI] Error in before_send_message:", err);
    }

    const hasContent = textToSend.trim().length > 0 || attachedImages.length > 0;

    // Command Check
    if (hasContent && textToSend.trim().startsWith("/")) {
        const cmd = textToSend;
        if (manualContent === undefined) setInputValue("");
            setIsGenerating(true);
            setIsRetrying(false);
            const genId = Date.now();
            generationIdRef.current = genId;
        
              try {
            const res = await invoke<string>("process_input", { chatId: activeChatId, input: cmd });
            if (res === "handled") {
                await fetchMessages(activeChatId!);
                setIsGenerating(false);
                setAttachedImages([]);
                return;
            }
            if (res.startsWith("generate:")) {
                const nextContent = res.substring(9);
                handleSendMessage(nextContent);
                return;
            }
        } catch(e) {
            addToast("Command Error: " + e, "error");
            setIsGenerating(false);
            return;
        }
    }

    let content = textToSend;

    if (manualContent === undefined) setInputValue("");

    const safeChar = activeCharacter || {
      id: 0,
      name: "Tavern",
      avatar: "",
      description: "",
      personality: "",

      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      tags: "",
      alternate_greetings: "",
      card_data: "",
      created_at: "",
    };

    if (hasContent) {
        try {
          content = await invoke<string>("process_macros_command", {
            text: content,
            character: safeChar,
            userName: activePersona?.name || "You",
          });
        } catch (e) {
          console.error("Macro processing failed:", e);
        }

        await invoke("save_message", {
          chatId: activeChatId,
          role: "user",
          content,
          images: attachedImages.length > 0 ? attachedImages : null,
        });

        setAttachedImages([]);

        const updatedMessages = await invoke<Message[]>("get_messages", {
          chatId: activeChatId,
        });

        setMessages([
          ...updatedMessages,
          {
            id: -1,
            chat_id: activeChatId,
            role: "char",
            content: "",
            timestamp: "",
            swipes: [],
            swipe_id: 0,
          },
        ]);
        triggerAutoSync(activeChatId);
    } else {
        // Empty send - just show spinner (optimistic bot msg)
        setMessages((prev) => [
          ...prev,
          {
            id: -1,
            chat_id: activeChatId,
            role: "char",
            content: "",
            timestamp: "",
            swipes: [],
            swipe_id: 0,
          },
        ]);
    }

    // Trigger Generation
    setIsGenerating(true);
    const genId = Date.now();
    generationIdRef.current = genId;

    const performGeneration = async (forcedSpeakerId?: number) => {
        setIsGenerating(true);
        let retryScheduled = false;
        let localErrStr = "";
        try {
          await invoke("generate_reply", {
            chatId: activeChatId,
            characterId: activeCharacterId,
            profileName: activeProfileName || "Default",
            presetName: activePresetFile || "Default",
            userName: activePersona?.name || "You",
            genId,
            forcedSpeakerId,
            ragConfig: getRagConfig()
          });
          await fetchMessages(activeChatId!);
          triggerAutoSync(activeChatId);

          const currentMsgs = await invoke<Message[]>("get_messages", { chatId: activeChatId });
          const last = currentMsgs[currentMsgs.length - 1];
          if (last && last.role === "char" && checkContentForErrors(last.content)) {
               retryScheduled = attemptAutoRetry(last.content, () => handleRegenerate(last.id));
               return;
          }
        } catch (e: any) {
            localErrStr = e.toString();
            
            // Clean up ghost message on error
            setMessages(prev => prev.filter(m => m.id !== -1));

            if (localErrStr.includes("MANUAL_ROUTING_REQUIRED")) {
                if (activeGroupId) {
                    invoke<Character[]>("get_group_members", { groupId: activeGroupId })
                        .then(mems => setManualGenerationMembers(mems))
                        .catch(err => console.error("Failed to fetch group members:", err));
                } else {
                    setManualGenerationMembers(characters.filter(c => c.id !== 0));
                }
                
                setPendingManualGeneration(() => (charId: number) => {
                    setPendingManualGeneration(null);
                    // Re-add the placeholder before starting
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: -1,
                            chat_id: activeChatId as number,
                            role: "char",
                            content: "",
                            timestamp: new Date().toISOString(),
                            is_system: false,
                            extra: "{}",
                        },
                    ]);
                    performGeneration(charId);
                });
                return;
            }

            if (localErrStr.includes("Aborted")) {
                addToast("Generation stopped.", "info");
                // Refresh to see if partial content was saved by backend
                await fetchMessages(activeChatId!);
            } else {
                retryScheduled = attemptAutoRetry(localErrStr, () => performGeneration(forcedSpeakerId));
                if (!retryScheduled) {
                    addToast("Generation failed: " + localErrStr, "error");
                }
            }
        } finally {
            if (generationIdRef.current === genId && !retryScheduled && !localErrStr.includes("MANUAL_ROUTING_REQUIRED")) {
                setIsGenerating(false);
                setIsRetrying(false);
            }
        }
    };

    await performGeneration();
  };

  const handleNewChat = async () => {
    if (activeCharacterId === null) return;

    let name = prompt("Chat Name:", `New Adventure`);
    if (name === null) return; // Cancelled
    if (name.trim() === "") name = "New Adventure";

    if (name) {
      const id = await invoke<number>("create_chat", {
        characterId: activeCharacterId,
        groupId: activeGroupId,
        name,
      });

      await refreshChats(activeCharacterId, activeGroupId);

      setActiveChatId(id);
    }
  };

  const handleRenameChat = async (id: number, newName: string) => {
    try {
      await invoke("rename_chat", { id, name: newName });
      if (activeCharacterId !== null) refreshChats(activeCharacterId, activeGroupId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteChat = async (id: number, name: string) => {
    if (confirm(`Delete chat "${name}"?`)) {
      try {
        await invoke("delete_chat", { id });
        if (activeChatId === id) {
            setActiveChatId(null);
            setMessages([]);
        }
        if (activeCharacterId !== null) refreshChats(activeCharacterId, activeGroupId);
        addToast("Chat deleted", "info");
      } catch (e) {
        addToast("Failed to delete chat: " + e, "error");
      }
    }
  };

  const handleExportChat = async () => {
    if (!activeChatId) return;

    try {
      const data = await invoke<string>("export_chat_jsonl", {
        chatId: activeChatId,
      });

      const filename = `${activeChat?.name || "chat"}.jsonl`.replace(
        /[/\\?%*:|"<>]/g,
        "_",
      );

      // Mobile Strategy: Share -> Clipboard

      if (isMobile) {
        if (
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({
            files: [new File([data], filename, { type: "text/plain" })],
          })
        ) {
          try {
            const file = new File([data], filename, { type: "text/plain" });

            await navigator.share({
              files: [file],

              title: "Export Chat",

              text: `TavernRev Chat Export: ${filename}`,
            });

            return;
          } catch (e) {
            console.warn("Share failed", e);
          }
        }

        // Fallback to Clipboard

                try {

                  await navigator.clipboard.writeText(data);

                  addToast("Share failed or not supported. Chat data copied to clipboard!", "info");

                } catch (e) {
          alert("Export failed: " + e);
        }

        return;
      }

      // Desktop Strategy: Rust Save -> Blob

      try {
        const savedPath = await invoke<string>("save_export_file", {
          filename,
          content: data,
        });

        addToast(`File saved to Downloads folder!\nPath: ${savedPath}`, "success");

        return;
      } catch (err) {
        console.warn("Rust save failed, falling back to Blob", err);
      }

      const blob = new Blob([data], { type: "text/plain" });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = filename;

      document.body.appendChild(a);

      a.click();

      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e);
    }
  };

  const handleImportChat = async (file: File) => {
    if (!activeCharacterId) {
      addToast("Select a character first!", "error");
      return;
    }

    const reader = new FileReader();

          reader.onload = async (e) => {

            const content = e.target?.result as string;

            try {
              const id = await invoke<number>("import_chat_jsonl", {
                characterId: activeCharacterId,
                data: content,
              });

    

              await refreshChats(activeCharacterId);

    

              setActiveChatId(id);

    

              addToast("Chat imported successfully!", "success");

            } catch (err) {

              addToast("Import failed: " + err, "error");

            }

          };

    

          reader.readAsText(file);
  };

  const handleCreateCharacter = async () => {
    try {
      const id = await invoke<number>("create_character", {
        name: "New Character",
        avatar: "default.png",
        description: "",
      });

      const updatedChars = await refreshCharacters();
      setActiveCharacterId(id);
      
      // Verification check to ensure character exists in state
      if (updatedChars.some(c => c.id === id)) {
          setIsEditingCharacter(true);
      } else {
          // Fallback: If not in state yet, just set ID and hope for re-render
          setIsEditingCharacter(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportCharacter = async (file: File) => {
    const reader = new FileReader();

      reader.onload = async (e) => {
        if (e.target?.result) {
          const bytes = Array.from(new Uint8Array(e.target.result as ArrayBuffer));
          try {
            await invoke("import_character_card", {
              data: bytes,
              fileName: file.name,
            });
            await refreshCharacters();
            addToast("Character imported successfully!", "success");
          } catch (e) {
            console.error(e);
            addToast("Import failed: " + e, "error");
          }
        }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleUpdateCharacter = async (updatedChar: Character) => {
    try {
      await invoke("update_character", { card: updatedChar });

      await refreshCharacters();

      setIsEditingCharacter(false);
    } catch (e) {
      console.error(e);
      addToast("Failed to update character: " + e, "error");
    }
  };

  const handleCreatePersona = async () => {
    try {
      const id = await invoke<number>("create_user_persona", {
        name: "New Persona",
        avatar: "user_default.png",
        description: "",
      });

      await refreshPersonas();

      const newPersona = (
        await invoke<UserPersona[]>("get_user_personas")
      ).find((p) => p.id === id);

      if (newPersona) setEditingPersona(newPersona);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdatePersona = async (updatedPersona: UserPersona) => {
    try {
      await invoke("update_user_persona", { persona: updatedPersona });

      await refreshPersonas();

      setEditingPersona(null);
    } catch (e) {
      console.error(e);
      addToast("Failed to update persona: " + e, "error");
    }
  };

  const handleSwipe = async (
    msgId: number,
    direction: "left" | "right",
    currentId: number,
    total: number,
  ) => {
    let nextId = direction === "left" ? currentId - 1 : currentId + 1;

    if (nextId < 0) nextId = total - 1;

    if (nextId >= total) nextId = 0;

    try {
      await invoke("swipe_message", { messageId: msgId, swipeIndex: nextId });

      await fetchMessages(activeChatId!);
      triggerAutoSync(activeChatId!);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegenerate = async (msgId: number, skipModal = false, customNudge: string | null = null) => {
    if (isGenerating && !isRetrying) return;

    if (!skipModal) {
        const charMsgs = messages.filter(m => m.role === 'char');
        if (charMsgs.length > 0 && charMsgs[0].id === msgId && messages.length <= 2) {
            setRegenGreetingModal(msgId);
            setCustomRegenNudge("");
            return;
        }
    }

    // Optimistic: Clear content and swipes of current message
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, content: "", swipes: [], swipe_id: 0 } : m)),
    );

    setIsGenerating(true);
    setIsRetrying(false);
    const genId = Date.now();
    generationIdRef.current = genId;

    const performRegeneration = async () => {
      setIsGenerating(true);
      let retryScheduled = false;
      try {
        await invoke("regenerate_reply", {
          chatId: activeChatId,
          messageId: msgId,
          characterId: activeCharacterId,
          profileName: activeProfileName || "Default",
          presetName: activePresetFile || "Default",
          userName: activePersona?.name || "You",
          genId,
          customNudge,
          ragConfig: getRagConfig()
        });        await fetchMessages(activeChatId!);

        const currentMsgs = await invoke<Message[]>("get_messages", { chatId: activeChatId });
        const last = currentMsgs.find(m => m.id === msgId);
        if (last && checkContentForErrors(last.content)) {
             retryScheduled = attemptAutoRetry(last.content, performRegeneration);
             return;
        }
      } catch (e: any) {
        const errStr = e.toString();
        if (errStr.includes("Aborted")) {
            addToast("Regeneration stopped.", "info");
            await fetchMessages(activeChatId!); // Restore previous state
        } else {
            retryScheduled = attemptAutoRetry(errStr, performRegeneration);
            if (!retryScheduled) {
                addToast("Regeneration failed: " + errStr, "error");
                await fetchMessages(activeChatId!); // Restore previous state on error
            }
        }
      } finally {
        if (generationIdRef.current === genId && !retryScheduled) {
            setIsGenerating(false);
            setIsRetrying(false);
        }
      }
    };

    await performRegeneration();
  };

  const handleContinue = async (msgId: number) => {
    if (isGenerating) return;

    setIsGenerating(true);
    const genId = Date.now();
    generationIdRef.current = genId;

    const performContinue = async () => {
      setIsGenerating(true);
      let retryScheduled = false;
      try {
        const newText = await invoke<string>("continue_reply", {
          chatId: activeChatId,
          messageId: msgId,
          characterId: activeCharacterId,
          profileName: activeProfileName || "Default",
          presetName: activePresetFile || "Default",
          userName: activePersona?.name || "You",
          genId,
          ragConfig: getRagConfig()
        });
        await fetchMessages(activeChatId as number);
        
        if (checkContentForErrors(newText)) {
             await invoke("revert_message_tail", { messageId: msgId, textToStrip: newText });
             await fetchMessages(activeChatId as number);
             retryScheduled = attemptAutoRetry(newText, performContinue);
             return;
        }
      } catch (e: any) {
        const errStr = e.toString();
        if (errStr.includes("Aborted")) {
            addToast("Continue stopped.", "info");
            await fetchMessages(activeChatId!);
        } else {
            retryScheduled = attemptAutoRetry(errStr, performContinue);
            if (!retryScheduled) {
                addToast("Continue failed: " + errStr, "error");
                await fetchMessages(activeChatId!);
            }
        }
      } finally {
        if (generationIdRef.current === genId && !retryScheduled) {
            setIsGenerating(false);
            setIsRetrying(false);
        }
      }
    };

    await performContinue();
  };

  const handleImpersonate = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    const genId = Date.now();
    generationIdRef.current = genId;

    const performImpersonate = async () => {
      setIsGenerating(true);
      let retryScheduled = false;
      try {
        const generatedText = await invoke<string>("impersonate_user", { 
          chatId: activeChatId,
          characterId: activeCharacterId,
          profileName: activeProfileName || "Default",
          presetName: activePresetFile || "Default",
          userName: activePersona?.name || "You",
          genId,
          userInput: inputValue,
          ragConfig: getRagConfig()
        });        
        setInputValue(generatedText);
      } catch (e: any) {
        const errStr = e.toString();
        if (errStr.includes("Aborted")) {
            addToast("Impersonation stopped.", "info");
        } else {
            retryScheduled = attemptAutoRetry(errStr, performImpersonate);
            if (!retryScheduled) addToast("Impersonation failed: " + errStr, "error");
        }
      } finally {
        if (generationIdRef.current === genId && !retryScheduled) {
            setIsGenerating(false);
            setIsRetrying(false);
        }
      }
    };

    await performImpersonate();
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async () => {
    if (editingMessageId) {
      try {
        await invoke("edit_message", {
          id: editingMessageId,
          content: editContent,
        });
        await fetchMessages(activeChatId!);
        triggerAutoSync(activeChatId!);
        setEditingMessageId(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDelete = async (mode: "swipe" | "message" | "branch") => {
    if (deletingMessageId && activeChatId) {
      if (deletingMessageId < 0) {
          addToast("Cannot delete a message that is still generating.", "error");
          setDeletingMessageId(null);
          return;
      }
      
      // Prevent deleting the very first message
      if (messages.length > 0 && messages[0].id === deletingMessageId) {
          addToast("Cannot delete the greeting message.", "info");
          setDeletingMessageId(null);
          return;
      }

      try {
        await invoke("delete_message", {
          id: deletingMessageId,
          mode,
          chatId: activeChatId,
        });
        await fetchMessages(activeChatId!);
        triggerAutoSync(activeChatId);
        setDeletingMessageId(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleBranch = async (msgId: number) => {
    if (!activeChatId) return;
    let newName = prompt("Branch Name:", `${activeChat?.name} (Branch)`);
    if (newName === null) return;
    if (newName.trim() === "") newName = `${activeChat?.name} (Branch)`;

    if (newName) {
      try {
        const newChatId = await invoke<number>("branch_chat", {
          chatId: activeChatId,
          fromMsgId: msgId,
          newName: newName,
        });
        setActiveChatId(newChatId);
      } catch (e) {
        addToast("Failed to branch: " + e, "error");
      }
    }
  };

  const handleStop = async () => {
    if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
    }
    setIsRetrying(false);
    setIsGenerating(false);
    await invoke("stop_generation");
  };

  // --- EFFECTS ---

  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    invoke<string | null>("get_startup_error").then((err) => {
      if (err) {
        addToast(err, "error");
        console.error("STARTUP ERROR:", err);
      }
    });

    // --- PLUGIN SYSTEM LOADER ---
    const loadPlugins = async () => {
        try {
            const scripts = await invoke<string[]>("get_extension_scripts");
            if (scripts.length > 0) {
                console.log(`[Plugin Loader] Found ${scripts.length} extensions. Loading...`);
                let loaded = 0;
                for (const script of scripts) {
                    try {
                        // Secure evaluation inside the app context
                        const fn = new Function(script);
                        fn();
                        loaded++;
                    } catch (err) {
                        console.error("[Plugin Loader] Failed to execute script:", err);
                    }
                }
                console.log(`[Plugin Loader] Successfully loaded ${loaded} plugins.`);
                TavernAPI.emit("on_app_ready", { totalPlugins: loaded });
            }
        } catch (e) {
            console.error("[Plugin Loader] Error fetching scripts from backend:", e);
        }
    };
    loadPlugins();
    // ----------------------------

    refreshCharacters();
    refreshGroups();
    refreshPersonas();
    fetchModelName();
  }, []); // Initial load

  useEffect(() => {
    const unlistenBackendLog = listen<string>("backend-log", (event) => {
        logger.addLog('info', [event.payload]);
    });

    const unlistenSpeaker = listen<{sender_id: number, sender_name: string}>("speaker_determined", (event) => {
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === -1 && last.role === "char") {
                return [
                    ...prev.slice(0, -1),
                    { ...last, sender_id: event.payload.sender_id, sender_name: event.payload.sender_name }
                ];
            }
            return prev;
        });
    });

    const unlistenToken = listen<StreamPayload>("stream-token", (event) => {
      if (event.payload.gen_id && event.payload.gen_id !== generationIdRef.current) return;
      
      setMessages((prev) => {
        const { content, target_id } = event.payload;
        
        if (target_id) {
            return prev.map(m => {
                if (m.id === target_id) {
                    const newContent = m.content + content;
                    let newSwipes = m.swipes ? [...m.swipes] : [];
                    if (newSwipes.length > 0) {
                        const sIdx = m.swipe_id || 0;
                        if (sIdx < newSwipes.length) newSwipes[sIdx] = newContent;
                    }
                    return { ...m, content: newContent, swipes: newSwipes };
                }
                return m;
            });
        }

        const last = prev[prev.length - 1];
        if (last && last.role === "char") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + content },
          ];
        }
        return prev;
      });
    });

    const unlistenFinish = listen("generation_finished", async () => {
      if (activeChatIdRef.current) fetchMessages(activeChatIdRef.current);

      try {
          const prompt = await invoke<string>("get_last_prompt");
          if (prompt) logger.addLog('info', [prompt]);

          if (localStorage.getItem("rag_enabled") === "true" && activeChatIdRef.current) {
              const ragChunkSize = parseInt(localStorage.getItem("rag_chunk_size") || "4");
              const ragOverlap = parseInt(localStorage.getItem("rag_overlap") || "1");
              invoke("build_chat_index", { chatId: activeChatIdRef.current, chunkSize: ragChunkSize, overlap: ragOverlap })
                 .then(count => console.log(`RAG Indexed ${count} chunks in background.`))
                 .catch(e => console.error("RAG background indexing failed", e));
          }
      } catch (e) {
          console.error("Failed to fetch last prompt for logger", e);
      }
    });

    const unlistenRag = listen<{count: number}>("rag_status", (e) => {
        addToast(`?? Recalled ${e.payload.count} past memories!`, "info");
    });
    const unlistenToast = listen<{message: string, type: string}>("toast-message", (e) => {
        addToast(e.payload.message, e.payload.type as any);
    });

    const unlistenBg = listen<string>("set-background", (e) => {
        setBgImage(e.payload);
        addToast("Background updated", "success");
    });

    const unlistenStyle = listen<"bubbles" | "document">("set-style", (e) => {
        setChatStyle(e.payload);
        addToast("Chat style updated", "success");
    });

    const unlistenPopup = listen<string>("show-popup", (e) => {
        setPopupContent(e.payload);
    });

    return () => {
      unlistenBackendLog.then((f) => f());
      unlistenSpeaker.then((f) => f());
      unlistenToken.then((f) => f());
      unlistenFinish.then((f) => f());
      unlistenRag.then((f) => f());
      unlistenToast.then((f) => f());
      unlistenBg.then((f) => f());
      unlistenStyle.then((f) => f());
      unlistenPopup.then((f) => f());
    };
  }, [fetchMessages]);

    useEffect(() => {
      if (activeCharacterId !== null) refreshChats(activeCharacterId, activeGroupId);
    }, [activeCharacterId, activeGroupId, refreshChats]);

    useEffect(() => {      
      if (activeChatId) {
          const chat = chats.find(c => c.id === activeChatId);
          setChatMemory(chat?.memory || "");
          setMessages([]); 
          fetchMessages(activeChatId!); 
      } else {
          setChatMemory("");
          setMessages([]);
      }
    }, [activeChatId, fetchMessages, chats]);

  // Aggressive Scroll on Load (to handle async image loading)

  useEffect(() => {
    if (currentView === "chat" && activeChatId && messages.length > 0) {
      const interval = setInterval(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
        }
      }, 100);

      const timeout = setTimeout(() => clearInterval(interval), 1000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [activeChatId, messages.length, currentView]); // Trigger on load, new messages, and view switch

  // Scroll on Streaming (Sticky Bottom)
  useEffect(() => {
    if (isGenerating && chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100; // 100px threshold
      
      if (isNearBottom) {
        chatContainerRef.current.scrollTop = scrollHeight;
      }
    }
  }, [messages, isGenerating]);

  // --- RENDER ---

  const bgLayer = (
      <div className="fixed inset-0 z-0 pointer-events-none select-none">
          {bgImage && <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out" style={{backgroundImage: `url('${bgImage}')`}} />}
          <div className={`absolute inset-0 ${bgImage ? "bg-gray-950/85 backdrop-blur-[3px]" : "bg-gray-950"}`} />
      </div>
  );

    if (currentView === "settings")
      return (
        <>
          {bgLayer}
          <div className="relative z-10 h-full">
              <Settings
                onBack={() => {
                    if (dataChangedRef.current) {
                        console.log("APP: Cloud changes detected. Deep refresh...");
                        refreshCharacters();
                        refreshGroups();
                        refreshPersonas();
                        fetchQuickReplies();
                        if (activeCharacterId !== null) refreshChats(activeCharacterId, activeGroupId);
                        dataChangedRef.current = false;
                    } else {
                        console.log("APP: UI settings only. Fast close.");
                        // We still refresh personas because they are fast and can be edited in settings
                        refreshPersonas();
                        fetchModelName();
                    }
                    
                    setActivePresetFile(localStorage.getItem("active_preset"));
                    setContentScale(parseFloat(localStorage.getItem("ui_content_scale") || "1.0"));
                    setChatStyle((localStorage.getItem("ui_chat_style") as any) || "bubbles");
                    setCurrentView("chat");
                }}
                markDataChanged={markDataChanged}
          chatId={activeChatId}
          characterId={activeCharacterId}
          addToast={addToast}
          bgMode={bgMode}
          setBgMode={setBgMode}
          setCustomBg={setCustomBg}
          retryEnabled={retryEnabled}
          setRetryEnabled={setRetryEnabled}
          retryTriggers={retryTriggers}
          setRetryTriggers={setRetryTriggers}
          retryDelay={retryDelay}
          setRetryDelay={setRetryDelay}
        />
        </div>
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </>
    );
  if (currentView === "character_select")
    return (
      <>
        {bgLayer}
        <div className="relative z-10 h-full flex flex-col bg-gray-950">
            <div className="flex items-center justify-between m-4 gap-3">
              <div className="flex bg-black/50 p-1 rounded-xl w-fit">
                <button 
                  onClick={() => setSelectMode("characters")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition ${selectMode === "characters" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  Characters
                </button>
                <button 
                  onClick={() => setSelectMode("groups")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition ${selectMode === "groups" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  Groups
                </button>
              </div>
              <button
                onClick={() => setCurrentView("settings")}
                title="Settings"
                className="p-3 bg-black/50 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition shrink-0"
              >
                <SettingsIcon size={20} />
              </button>
            </div>
            
            <div className="flex-1 min-h-0">
            {selectMode === "characters" ? (
              <CharacterSelect
                characters={characters}
                onSelect={(id) => {
                  setActiveCharacterId(id);
                  setActiveGroupId(null);
                  setActiveChatId(null);
                  setMessages([]);
                  setCurrentView("chat");
                }}
                onCreate={handleCreateCharacter}
                onImport={handleImportCharacter}
                refreshCharacters={refreshCharacters}
                addToast={addToast}
              />
            ) : (
              <GroupSelect
                groups={groups}
                characters={characters}
                onSelect={(id) => {
                  setActiveGroupId(id);
                  setActiveCharacterId(0); // System character handles groups
                  setActiveChatId(null);
                  setMessages([]);
                  setCurrentView("chat");
                }}
                onCreate={handleCreateGroup}
                onDelete={handleDeleteGroup}
              />
            )}
            </div>
        </div>
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </>
    );

  return (
    <div className="flex h-dvh bg-transparent text-gray-100 font-sans overflow-hidden relative">
      {bgLayer}
      
      <div className="absolute inset-0 z-10 flex min-w-0">
      {/* MOBILE OVERLAY */}
      {isMobile && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      <Sidebar isMobile={isMobile} sidebarVisible={sidebarVisible} setSidebarVisible={setSidebarVisible} setCurrentView={setCurrentView} handleNewChat={handleNewChat} handleImportChat={handleImportChat} chats={chats} activeChatId={activeChatId} setActiveChatId={setActiveChatId} handleRenameChat={handleRenameChat} handleDeleteChat={handleDeleteChat} />

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* HEADER */}
        <header className="h-16 flex items-center justify-between px-4 bg-gray-900/50 backdrop-blur-md border-b border-white/10 shrink-0 pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition mr-1 shrink-0"
            >
              <Menu size={20} />
            </button>
            <Avatar
              src={activeGroupId && activeGroup ? (activeGroup.avatar || "default.png") : (activeCharacter?.avatar || "default.png")}
              name={activeGroupId && activeGroup ? activeGroup.name : (activeCharacter?.name || "Tavern")}
            />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm leading-tight truncate">
                  {activeGroupId && activeGroup ? activeGroup.name : (activeCharacter?.name || "Tavern")}
                </span>
                <button
                  onClick={() => activeGroupId ? setIsEditingGroup(true) : setIsEditingCharacter(true)}
                  className="text-gray-500 hover:text-white transition p-0.5 rounded shrink-0"
                >
                  <Pencil size={12} />
                </button>
              </div>
              <div className="text-[10px] text-cyan-400 font-mono truncate">
                {modelName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {autoSyncStatus !== "idle" && (
                <div className={`p-2 hidden sm:flex items-center justify-center transition-all duration-500 ${autoSyncStatus === "success" ? "text-emerald-400" : autoSyncStatus === "error" ? "text-red-400" : "text-blue-400"}`} title={`Auto-Sync: ${autoSyncStatus}`}>
                    {autoSyncStatus === "syncing" && <CloudUpload size={16} className="animate-pulse" />}
                    {autoSyncStatus === "success" && <Check size={16} className="animate-in fade-in" />}
                    {autoSyncStatus === "error" && <X size={16} />}
                </div>
            )}
            <button
              onClick={handleExportChat}
              title="Export Chat"
              className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition hidden sm:flex"
            >
              <Download size={20} />
            </button>
            <button
              onClick={fetchStats}
              title="Chat Stats"
              className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
            >
              <Activity size={20} />
            </button>
            <button
              onClick={() => setShowPersonaModal(true)}
              title="Switch Persona"
              className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
            >
              <UserCircle size={20} />
            </button>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <button
              onClick={() => setCurrentView("settings")}
              className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition"
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>

        {/* MESSAGES */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar"
        >
          {hasMore && (
            <div className="flex justify-center py-2">
              <button
                onClick={handleLoadMore}
                className="text-xs text-gray-500 hover:text-white bg-gray-800/50 px-3 py-1 rounded-full transition hover:bg-gray-700"
              >
                Load previous messages...
              </button>
            </div>
          )}
          {messages.map((msg, index) => {
            const isUser = msg.role === "user";
            let avatarSrc = "default.png";
            let name = "Unknown";
            const char = characters.find((c) => c.id === activeCharacterId);
            
            if (isUser) {
                avatarSrc = activePersona?.avatar || "user_default.png";
                name = activePersona?.name || "You";
            } else if (activeGroupId && msg.sender_id) {
                const sender = characters.find(c => c.id === msg.sender_id);
                avatarSrc = sender?.avatar || "default.png";
                name = sender?.name || msg.sender_name || "Bot";
            } else {
                avatarSrc = char?.avatar || "default.png";
                name = char?.name || "Bot";
            }

            // Inject Alt Greetings for the very first message
            let displaySwipes = msg.swipes ? [...msg.swipes] : [];
            if (index === 0 && !isUser && char?.alternate_greetings) {
                try {
                    const alts = JSON.parse(char.alternate_greetings);
                    if (Array.isArray(alts)) {
                        alts.forEach(alt => {
                            if (alt && alt.trim() && !displaySwipes.includes(alt) && alt !== msg.content) {
                                displaySwipes.push(alt);
                            }
                        });
                    }
                } catch(e) {}
            }

            // --- DOCUMENT MODE ---
            if (chatStyle === "document") {
                return (
                    <div 
                        key={msg.id} 
                        className="group w-full py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors px-4 md:px-0"
                        onClick={() => isMobile && setActiveMessageId(activeMessageId === msg.id ? null : msg.id)}
                    >
                        <div className="max-w-4xl mx-auto">
                             <div className="flex items-center justify-between mb-2">
                                 <div className="flex items-center gap-3">
                                     <div className="shrink-0">
                                        <Avatar src={avatarSrc} name={name} size="xs" type={isUser ? "user" : "char"} zoomable={true} />
                                     </div>
                                     <span className={`font-bold text-sm ${isUser ? 'text-indigo-400' : 'text-emerald-400'}`}>{name}</span>
                                     <span className="text-[10px] text-gray-600 font-mono hidden sm:inline-block">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                                 
                                 <div className="flex items-center gap-2">
                                     {displaySwipes.length > 1 && (
                                         <div className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-800/50 rounded px-1.5 py-0.5 border border-white/5">
                                             <button onClick={(e) => { e.stopPropagation(); handleSwipe(msg.id, "left", msg.swipe_id||0, displaySwipes.length); }} className="hover:text-white"><ChevronLeft size={10}/></button>
                                             <span className="font-mono">{(msg.swipe_id || 0) + 1}/{displaySwipes.length}</span>
                                             <button onClick={(e) => { e.stopPropagation(); handleSwipe(msg.id, "right", msg.swipe_id||0, displaySwipes.length); }} className="hover:text-white"><ChevronRight size={10}/></button>
                                         </div>
                                     )}
                                     <div className={`flex gap-1 transition-opacity ${isMobile ? (activeMessageId === msg.id ? "opacity-100" : "opacity-0 pointer-events-none") : "opacity-0 group-hover:opacity-100"}`}>
                                          {!isUser && (
                                              <button onClick={(e) => { e.stopPropagation(); handleContinue(msg.id); }} className="p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5" title="Continue"><Play size={12}/></button>
                                          )}
                                          {!isUser && (
                                              <button onClick={(e) => { e.stopPropagation(); handleRegenerate(msg.id); }} className="p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5" title="Regenerate"><RefreshCw size={12}/></button>
                                          )}
                                          <button onClick={(e) => { e.stopPropagation(); handleBranch(msg.id); }} className="p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5" title="Branch"><GitBranch size={12}/></button>
                                          <button onClick={(e) => { e.stopPropagation(); handleStartEdit(msg); }} className="p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5" title="Edit"><Pencil size={12}/></button>
                                          {!(!hasMore && index === 0) && (
                                              <button onClick={(e) => { e.stopPropagation(); setDeletingMessageId(msg.id); }} className="p-1.5 text-gray-500 hover:text-red-400 rounded hover:bg-white/5" title="Delete"><Trash2 size={12}/></button>
                                          )}
                                     </div>
                                 </div>
                             </div>

                             <div className="min-w-0 pl-0 md:pl-0">
                                 {editingMessageId === msg.id ? (
                                    <div className="w-full">
                                        <AutoResizeTextarea 
                                            value={editContent} 
                                            onChange={e => setEditContent(e.target.value)} 
                                            className="w-full bg-transparent text-gray-100 p-0 border-0 focus:ring-0 focus:outline-none text-base leading-relaxed font-sans" 
                                            placeholder="Edit message..."
                                            autoFocus
                                        />
                                        <div className="flex gap-2 mt-2 justify-end">
                                            <button onClick={() => setEditingMessageId(null)} className="text-xs text-gray-500 hover:text-white px-3 py-1">Cancel</button>
                                            <button onClick={handleSaveEdit} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg font-bold">Save</button>
                                        </div>
                                    </div>
                                 ) : (
                                     <MessageContent 
                                         content={displaySwipes[msg.swipe_id || 0] || msg.content} 
                                         isUser={isUser} 
                                         scale={contentScale} 
                                         userName={activePersona?.name} 
                                         charName={activeCharacter?.name} 
                                         images={msg.images}
                                     />
                                 )}
                             </div>
                        </div>
                    </div>
                );
            }

            // --- BUBBLES MODE ---
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[90%] group ${isUser ? "ml-auto flex-row-reverse" : ""}`}
              >
                <Avatar
                  src={avatarSrc}
                  name={name}
                  size="sm"
                  type={isUser ? "user" : "char"}
                  zoomable={true}
                />
                <div
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"} min-w-0 flex-1`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                      {name}
                    </span>
                    {displaySwipes.length > 1 && (
                        <div className="flex items-center gap-1 text-[9px] text-gray-600 bg-gray-900/50 rounded px-1.5 py-0.5 border border-white/5">
                            <button onClick={() => handleSwipe(msg.id, "left", msg.swipe_id||0, displaySwipes.length)} className="hover:text-white"><ChevronLeft size={8}/></button>
                            <span>{(msg.swipe_id || 0) + 1}/{displaySwipes.length}</span>
                            <button onClick={() => handleSwipe(msg.id, "right", msg.swipe_id||0, displaySwipes.length)} className="hover:text-white"><ChevronRight size={8}/></button>
                        </div>
                    )}
                  </div>

                  {editingMessageId === msg.id ? (
                    <div className="w-full">
                      <AutoResizeTextarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-gray-800 text-gray-100 rounded-xl p-3 border border-indigo-500 focus:outline-none text-sm leading-relaxed"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setEditingMessageId(null)}
                          className="p-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
                        >
                          <X size={14} />
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                                       ) : (
                                           <>
                                                                   <div
                                                                     className={`relative px-4 py-3 rounded-2xl shadow-sm ${isUser ? "bg-indigo-600 text-white rounded-tr-none" : "bg-gray-950 border border-gray-800 text-gray-100 rounded-tl-none"}`}>
                                                                     <MessageContent
                                                                       content={displaySwipes[msg.swipe_id || 0] || msg.content}
                                                                       isUser={isUser}
                                                                       scale={contentScale}
                                                                       userName={activePersona?.name}
                                                                       charName={char?.name}
                                                                       images={msg.images}
                                                                     />                                                   
                                                   <div className="absolute -top-3 right-0 md:opacity-0 group-hover:opacity-100 opacity-100 flex gap-1 bg-gray-900/80 rounded-lg p-0.5 border border-white/10 backdrop-blur transition-opacity">
                          <button
                            onClick={() => handleBranch(msg.id)}
                            className="p-1 text-gray-400 hover:text-white"
                            title="Branch Chat"
                          >
                            <GitBranch size={12} />
                          </button>
                          <button
                            onClick={() => handleStartEdit(msg)}
                            className="p-1 text-gray-400 hover:text-white"
                          >
                            <Pencil size={12} />
                          </button>
                          {!(!hasMore && index === 0) && (
                              <button
                                onClick={() => setDeletingMessageId(msg.id)}
                                className="p-1 text-gray-400 hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                          )}
                        </div>{" "}
                      </div>

                      {!isUser && (
                        <div className="flex gap-2 mt-1 text-gray-500 items-center select-none px-1">
                          {msg.swipes && msg.swipes.length > 1 && (
                            <div className="flex items-center bg-gray-800/50 rounded-lg border border-white/5 overflow-hidden">
                              <button
                                onClick={() =>
                                  handleSwipe(
                                    msg.id,
                                    "left",
                                    msg.swipe_id || 0,
                                    msg.swipes!.length,
                                  )
                                }
                                className="p-1 hover:bg-white/10 transition"
                              >
                                <ChevronLeft size={12} />
                              </button>
                              <span className="text-[9px] px-1.5 font-mono text-gray-400">
                                {(msg.swipe_id || 0) + 1}/{msg.swipes.length}
                              </span>
                              <button
                                onClick={() =>
                                  handleSwipe(
                                    msg.id,
                                    "right",
                                    msg.swipe_id || 0,
                                    msg.swipes!.length,
                                  )
                                }
                                className="p-1 hover:bg-white/10 transition"
                              >
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          )}
                          {index === messages.length - 1 && (
                            <div className="flex gap-1 items-center">
                              <button
                                onClick={() => handleContinue(msg.id)}
                                className="p-1.5 hover:text-white hover:bg-white/5 rounded-lg transition"
                                title="Continue"
                              >
                                <FilePlus size={12} />
                              </button>
                              <button
                                onClick={() => handleRegenerate(msg.id)}
                                className="p-1.5 hover:text-white hover:bg-white/5 rounded-lg transition"
                                title="Regenerate"
                              >
                                <RefreshCw
                                  size={12}
                                  className={isGenerating ? "animate-spin" : ""}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <MessageInput quickReplies={quickReplies} showQR={showQR} setShowQR={setShowQR} attachedImages={attachedImages} setAttachedImages={setAttachedImages} showInputMenu={showInputMenu} setShowInputMenu={setShowInputMenu} setShowMemoryModal={setShowMemoryModal} chatMemory={chatMemory} handleImpersonate={handleImpersonate} handleExportChat={handleExportChat} fileInputRef={fileInputRef} handleImageSelect={handleImageSelect} inputValue={inputValue} setInputValue={setInputValue} handlePaste={handlePaste} handleSendMessage={handleSendMessage} handleStop={handleStop} isGenerating={isGenerating} isRetrying={isRetrying} activeChatId={activeChatId} activePersonaName={activePersona?.name || "You"} isMobile={isMobile} />

        {/* MODALS */}
        {isEditingCharacter && activeCharacter && (
          <CharacterEditor
            character={activeCharacter}
            onSave={handleUpdateCharacter}
            onCancel={() => setIsEditingCharacter(false)}
            addToast={addToast}
          />
        )}
        
        {isEditingGroup && activeGroup && (
          <GroupEditor
            group={activeGroup}
            allCharacters={characters}
            onClose={() => setIsEditingGroup(false)}
            onSave={() => {
              setIsEditingGroup(false);
              refreshGroups();
            }}
          />
        )}

        {pendingManualGeneration && activeGroup && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-sm flex flex-col shadow-2xl">
              <div className="p-4 border-b border-white/10 shrink-0">
                <h2 className="text-lg font-bold text-white">Select Next Speaker</h2>
                <p className="text-xs text-gray-400 mt-1">Manual Routing Strategy is active.</p>
              </div>
              <div className="p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                {manualGenerationMembers.map(char => {
                  return (
                    <button
                      key={char.id}
                      onClick={() => pendingManualGeneration(char.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition text-left"
                    >
                      <Avatar src={char.avatar} name={char.name} size="sm" />
                      <span className="font-medium text-sm text-gray-200">{char.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="p-3 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => setPendingManualGeneration(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showStatsModal && chatStats && (
          <StatsModal
            stats={chatStats}
            onClose={() => setShowStatsModal(false)}
          />
        )}

        {showMemoryModal && activeChatId && (
          <ChatMemoryModal
            chatId={activeChatId}
            initialMemory={chatMemory}
            activeProfileName={activeProfileName}
            activePresetFile={activePresetFile}
            onClose={() => setShowMemoryModal(false)}
            onSave={(newMem) => setChatMemory(newMem)}
          />
        )}

        {regenGreetingModal !== null && (
          <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-gray-800 rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl flex flex-col">
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <RefreshCw size={18} className="text-emerald-400" /> Regenerate Greeting
                </h3>
                <button
                  onClick={() => setRegenGreetingModal(null)}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-400">
                  You can randomize the first message using the default preset randomizer, or write a custom scenario nudge to steer the roleplay.
                </p>
                <textarea
                  className="w-full bg-gray-900 border border-white/10 rounded-xl p-3 text-sm text-gray-200 outline-none focus:border-emerald-500/50 resize-none h-32 custom-scrollbar"
                  placeholder="Optional: Tell the bot how to start the roleplay (e.g. 'You are sitting at the bar when I walk in...')"
                  value={customRegenNudge}
                  onChange={(e) => setCustomRegenNudge(e.target.value)}
                />
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-gray-900/30 rounded-b-2xl">
                <button
                  onClick={() => {
                      const id = regenGreetingModal;
                      setRegenGreetingModal(null);
                      handleRegenerate(id, true, null);
                  }}
                  className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition"
                >
                  Randomize (Default)
                </button>
                <button
                  onClick={() => {
                      const id = regenGreetingModal;
                      setRegenGreetingModal(null);
                      handleRegenerate(id, true, customRegenNudge.trim().length > 0 ? customRegenNudge : null);
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-900/20 active:scale-95"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        )}

        {showPersonaModal && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <UserCircle size={18} className="text-indigo-400" /> Switch
                  Persona
                </h3>
                <button
                  onClick={() => setShowPersonaModal(false)}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {userPersonas.map((persona) => (
                  <div
                    key={persona.id}
                    className={`group flex items-center gap-2 p-2 rounded-xl transition-all ${activeChat?.user_persona_id === persona.id ? "bg-indigo-600/20 border border-indigo-500/30" : "hover:bg-white/5 border border-transparent"}`}
                  >
                    <button
                      onClick={() => handleSwitchPersona(persona.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <Avatar
                        src={persona.avatar}
                        name={persona.name}
                        size="sm"
                        type="user"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-bold text-sm truncate ${activeChat?.user_persona_id === persona.id ? "text-indigo-300" : "text-gray-200"}`}
                        >
                          {persona.name}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {persona.description || "No description"}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setEditingPersona(persona)}
                      className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition md:opacity-0 group-hover:opacity-100"
                    >
                      <Pencil size={14} />
                    </button>                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-white/10 bg-gray-900/50">
                <button
                  onClick={handleCreatePersona}
                  className="w-full py-2.5 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition border border-white/5"
                >
                  <Plus size={14} /> Create New Persona
                </button>
              </div>
            </div>
          </div>
        )}

        {deletingMessageId && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl p-5 space-y-4">
              <h3 className="font-bold text-lg text-white">Delete Message?</h3>
              <div className="flex flex-col gap-2">
                {messages.find((m) => m.id === deletingMessageId)?.swipes &&
                  messages.find((m) => m.id === deletingMessageId)!.swipes!
                    .length > 1 && (
                    <button
                      onClick={() => handleDelete("swipe")}
                      className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium text-left transition text-gray-200 hover:text-white"
                    >
                      Only this Swipe (Variant)
                    </button>
                  )}
                <button
                  onClick={() => handleDelete("message")}
                  className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium text-left transition text-gray-200 hover:text-white"
                >
                  Entire Message (All Swipes)
                </button>
                <button
                  onClick={() => handleDelete("branch")}
                  className="p-3 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-500/20 rounded-xl text-sm font-medium text-left transition"
                >
                  Delete Message & All Following
                </button>
              </div>
              <button
                onClick={() => setDeletingMessageId(null)}
                className="w-full py-2 text-gray-500 hover:text-white text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {editingPersona && (
          <PersonaEditor
            persona={editingPersona}
            onSave={handleUpdatePersona}
            onCancel={() => setEditingPersona(null)}
          />
        )}
        
        {popupContent && (
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
              <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
                <div className="prose prose-invert prose-sm max-w-none mb-6 flex-1 overflow-y-auto custom-scrollbar">
                   <div dangerouslySetInnerHTML={{ __html: converter.makeHtml(popupContent) }} />
                </div>
                <button 
                    onClick={() => setPopupContent(null)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition shrink-0 shadow-lg shadow-indigo-500/20"
                >
                    OK
                </button>
              </div>
            </div>
        )}

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </main>
      </div>
    </div>
  );
}

export default App;
