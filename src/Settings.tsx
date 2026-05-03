import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Download,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Plus,
  Trash2,
  Edit,
  Wifi,
  User as UserIcon,
  FileText,
  LayoutTemplate,
  ChevronRight,
  Eye,
  Brain,
  Minimize2,
  Maximize2,
  Bug,
  Code,
  X,
  Cloud,
  Globe,
  UserCircle,
  Zap,
  Puzzle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import PersonaEditor from "./components/PersonaEditor";
import { ConnectionTab } from "./components/settings/ConnectionTab";
import { TextGenTab } from "./components/settings/TextGenTab";
import { UiTab } from "./components/settings/UiTab";
import { FormattingTab } from "./components/settings/FormattingTab";
import { PersonaTab } from "./components/settings/PersonaTab";
import { RegexTab } from "./components/settings/RegexTab";
import { QuickRepliesTab } from "./components/settings/QuickRepliesTab";
import { UserSettingsTab } from "./components/settings/UserSettingsTab";
import { WorldInfoTab } from "./components/settings/WorldInfoTab";
import { SyncTab } from "./components/settings/SyncTab";
import { AdvancedTab } from "./components/settings/AdvancedTab";
import { ExtensionsTab } from "./components/settings/ExtensionsTab";
import { DebugConsole } from "./components/DebugConsole";
import {
  DEFAULT_PRESET_VALUES,
  coerceConnectionFieldValue,
  fetchAvailableModels,
  loadConnectionProfileFile,
  loadUiSettingsFromStorage,
  normalizePreset,
  saveConnectionProfileFile,
  savePresetFile,
  useActivePreset,
} from "./components/settings/runtime";
import { DEFAULT_CONNECTION_PROFILE } from "./components/settings/shared";
import { UserPersona, RegexScript, QuickReply } from "./types";
import { ToastType } from "./components/Toast";

// --- TYPE DEFINITIONS ---

export type PromptModule = {
  identifier: string;
  name: string;
  content: string;
  role: string;
  enabled: boolean;
  injection_order: number;
  injection_depth: number;
  injection_position: number;
  system_prompt?: boolean;
  marker?: boolean;
  forbid_overrides?: boolean;
  injection_trigger?: string[];
  originalIndex?: number;
};

// UserPersona is imported

export type Preset = {
  model_name: string;
  temperature: number;
  top_p: number;
  top_k: number;
  top_a: number;
  min_p: number;
  repetition_penalty: number;
  presence_penalty: number;
  frequency_penalty: number;
  openai_max_tokens: number;
  stream_openai: boolean;
  seed: number;
  prompts: PromptModule[];
  impersonation_prompt: string;
  continue_nudge_prompt: string;
  stop_strings: string;
  instruct_mode_enabled: boolean;
  input_sequence: string;
  output_sequence: string;
  system_sequence: string;

  // Extra SillyTavern Fields
  wi_format: string;
  scenario_format: string;
  personality_format: string;
  names_behavior: number;
  send_if_empty: string;
  new_chat_prompt: string;
  new_group_chat_prompt: string;
  new_example_chat_prompt: string;
  group_nudge_prompt: string;
  assistant_prefill: string;
  assistant_impersonation: string;
  reasoning_effort: string;
  show_thoughts: boolean;
  wi_scan_depth: number;
  wi_recursive: boolean;
  wi_case_sensitive: boolean;
  wi_match_whole_words: boolean;
  wi_max_recursion: number;
  wi_token_budget: number;
  wi_context_percent: number;
  wi_include_names: boolean;
  wi_insertion_strategy: string;
  squash_system_messages: boolean;
  request_images: boolean;
  send_char_avatar: boolean;
  send_user_avatar: boolean;
  char_avatar_prompt: string;
  user_avatar_prompt: string;
};

type ImportedRegexScript = {
  id?: number | string;
  script_name?: string;
  scriptName?: string;
  regex?: string;
  findRegex?: string;
  replacement?: string;
  replaceString?: string;
  placement?: string | number[];
  markdownOnly?: boolean;
};

const normalizeImportedRegexPlacement = (placement: ImportedRegexScript["placement"]): string => {
  if (typeof placement === "string") {
    const normalized = placement.toLowerCase();
    if (normalized === "user" || normalized === "ai" || normalized === "both") {
      return normalized;
    }
  }

  if (Array.isArray(placement)) {
    const hasUser = placement.includes(1);
    const hasAi = placement.includes(2) || placement.includes(6);

    if (hasUser && hasAi) return "both";
    if (hasUser) return "user";
    if (hasAi) return "ai";
  }

  return "both";
};

const normalizeImportedRegexScript = (script: ImportedRegexScript, fallbackId: number): RegexScript | null => {
  const scriptName = script.script_name ?? script.scriptName;
  const regex = script.regex ?? script.findRegex;

  if (!scriptName || !regex) {
    return null;
  }

  return {
    id: typeof script.id === "number" ? script.id : fallbackId,
    script_name: scriptName,
    regex,
    replacement: script.replacement ?? script.replaceString ?? "",
    placement: normalizeImportedRegexPlacement(script.placement),
    run_on_markdown: script.markdownOnly ?? true,
  };
};

const parseImportedRegexScripts = (content: string, startId: number): RegexScript[] => {
  const parsed = JSON.parse(content);
  const rawScripts = Array.isArray(parsed) ? parsed : [parsed];

  return rawScripts
    .map((script, index) => normalizeImportedRegexScript(script, startId + index))
    .filter((script): script is RegexScript => script !== null);
};

export type ApiType =
  | "chat_completion"
  | "text_completion"
  | "novelai"
  | "horde"
  | "kobold";
export type ChatSource = "openai" | "claude" | "grok" | "deepseek" | "custom";
export type PostProcessing =
  | "none"
  | "tools"
  | "merge"
  | "merge_tools"
  | "semi_strict"
  | "semi_strict_tools"
  | "strict"
  | "strict_tools";

export type ConnectionProfile = {
  name: string;
  api_type: ApiType;
  chat_source: ChatSource;
  base_url: string;
  api_key: string;
  model_id: string;
  post_processing: PostProcessing;
  context_size: number;
};

// --- HELPER COMPONENTS ---

export const Slider = ({
  label,
  field,
  value,
  min,
  max,
  step,
  onChange,
  helpText,
}: any) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleCommit = () => {
      onChange(field, localVal);
  };

  return (
  <div className="space-y-3 bg-gray-900/40 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
    <div className="flex justify-between items-center">
      <label className="text-sm text-gray-300 font-medium">{label}</label>
      <input
        type="number"
        value={localVal}
        onChange={(e) => {
            setLocalVal(e.target.value);
            onChange(field, e.target.value);
        }}
        className="w-16 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-indigo-500 font-mono"
        min={min}
        max={max}
        step={step}
      />
    </div>
    <input
      type="range"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onMouseUp={handleCommit}
      onTouchEnd={handleCommit}
      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
      min={min}
      max={max}
      step={step}
    />
    {helpText && <p className="text-[10px] text-gray-500">{helpText}</p>}
  </div>
  );
};

export const Toggle = ({ label, field, value, onChange, helpText }: any) => (
  <div className="flex justify-between items-center p-3 bg-gray-900/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
    <div className="flex flex-col">
      <label className="text-sm text-gray-300 font-medium">{label}</label>
      {helpText && <p className="text-[10px] text-gray-500">{helpText}</p>}
    </div>
    <button
      onClick={() => onChange(field, !value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${value ? "bg-indigo-600" : "bg-gray-700"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  </div>
);

export const InputField = React.memo(({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: any) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-gray-300 font-medium ml-1">{label}</label>
      <input
        type={type}
        value={localValue || ""}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
        placeholder={placeholder}
      />
    </div>
  );
});

export const TextAreaField = React.memo(({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: any) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-gray-300 font-medium ml-1">{label}</label>
      <textarea
        value={localValue || ""}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-y font-mono shadow-inner custom-scrollbar"
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
});

export const SelectField = ({ label, value, onChange, options }: any) => (
  <div className="space-y-1.5">
    <label className="text-sm text-gray-300 font-medium ml-1">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 appearance-none"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-4 top-3 pointer-events-none text-gray-500">
        <ChevronRight size={14} className="rotate-90" />
      </div>
    </div>
  </div>
);

// --- PROMPT MODULE ITEM COMPONENT ---
const PromptModuleItem = React.memo(({
  module,
  tokenCount,
  onEdit,
  onDelete,
  onToggle,
  isAllExpanded,
}: any) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with global "Expand All" state if it changes
  useEffect(() => {
    if (isAllExpanded !== null) setIsExpanded(isAllExpanded);
  }, [isAllExpanded]);

  return (
    <div className="bg-gray-900/40 border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition group">
      <div
        className="flex items-center gap-2 p-1.5 md:p-2.5 cursor-pointer select-none bg-gray-800/20 hover:bg-gray-800/40 transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={`transition-transform duration-200 text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
        >
          <ChevronRight size={14} />
        </div>
        <div className="w-6 h-6 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 border border-white/5 font-mono text-[9px] text-indigo-400 font-bold">
          {module.injection_order}
        </div>
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
          <span className="font-bold text-gray-200 text-xs sm:text-sm truncate">
            {module.name || "Unnamed"}
          </span>
          <div className="flex items-center gap-1">
            {tokenCount !== undefined && (
              <span
                className="text-[8px] bg-gray-800 px-1 py-0.5 rounded text-gray-400 border border-white/5 font-mono shrink-0"
                title="Estimated Tokens"
              >
                {tokenCount}t
              </span>
            )}
            <span className="text-[9px] uppercase tracking-wider bg-gray-800 px-1 py-0.5 rounded text-gray-500 border border-white/5 truncate max-w-[60px] sm:max-w-[80px] shrink-0">
              {module.role}
            </span>
          </div>
        </div>
        <div
          className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(module)}
            className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
            title="Edit"
          >
            <Edit size={12} />
          </button>
          <button
            onClick={() => onDelete(module.identifier)}
            className="p-1 hover:bg-red-500/20 rounded-lg text-gray-600 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
          <div className="w-px h-3 bg-white/10 mx-0.5" />
          <Toggle
            field="enabled"
            value={module.enabled}
            onChange={() => onToggle(module.identifier)}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-white/5 bg-black/20 text-xs font-mono text-gray-400 whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-1 duration-200 select-text">
          {module.content}
        </div>
      )}
    </div>
  );
});

const ModuleEditor = ({ module, onSave, onCancel }: any) => {
  const [formData, setFormData] = useState({ ...module, enabled: module.enabled ?? true });
  const handleChange = (field: string, value: any) =>
    setFormData((prev: any) => ({ ...prev, [field]: value }));

  const roleOptions = [
    { value: "system", label: "System" },
    { value: "user", label: "User" },
    { value: "assistant", label: "Assistant" },
  ];

  const positionOptions = [
    { value: 0, label: "Relative (Native)" },
    { value: 1, label: "In-Chat (Depth)" },
    { value: 2, label: "RAG / Custom Location" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90dvh] border border-white/10 overflow-hidden ring-1 ring-white/10">
        <h2 className="text-lg font-bold p-5 border-b border-white/10 flex items-center gap-3 bg-gray-800/50">
          <LayoutTemplate size={20} className="text-indigo-400" />
          {module.identifier ? "Edit Module" : "Create New Module"}
        </h2>
        <main className="p-6 space-y-5 overflow-y-auto custom-scrollbar bg-gray-950/50">
          <Toggle label="Module Enabled" field="enabled" value={formData.enabled} onChange={(_: any, v: any) => handleChange("enabled", v)} />
          <InputField
            label="Module Name"
            value={formData.name}
            onChange={(v: string) => handleChange("name", v)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SelectField
              label="Role"
              value={formData.role}
              onChange={(v: string) => handleChange("role", v)}
              options={roleOptions}
            />
            <SelectField
               label="Injection Position"
               value={formData.injection_position ?? 0}
               onChange={(v: any) => handleChange("injection_position", Number(v))}
               options={positionOptions}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <InputField
              label="Injection Order"
              value={formData.injection_order}
              onChange={(v: string) =>
                handleChange("injection_order", Number(v))
              }
              type="number"
              helpText="Relative priority. Lower = Higher in prompt."
            />
            {(formData.injection_position === 1 || formData.injection_position === 2) && (
               <InputField
                 label="Injection Depth"
                 value={formData.injection_depth ?? 0}
                 onChange={(v: string) =>
                   handleChange("injection_depth", Number(v))
                 }
                 type="number"
                 helpText="Messages from bottom (In-Chat only)."
               />
            )}
          </div>

          <TextAreaField
            label="Content"
            value={formData.content}
            onChange={(v: string) => handleChange("content", v)}
            rows={10}
            helpText="Supports macros like {{char}}, {{user}}, {{memory}}."
          />
        </main>        <footer className="p-5 flex justify-end gap-3 border-t border-white/10 bg-gray-900">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-sm font-medium text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg"
          >
            Save Module
          </button>
        </footer>
      </div>
    </div>
      );
  };
  
export const MacroTester = ({ characterId }: { characterId: number | null }) => {
      const [input, setInput] = useState(`Math: 10 + 5 = {{add::10::5}}
Logic: 10 > 5 is {{gt::10::5}}
Var: {{setvar::hp::100}}HP: {{getvar::hp}}
Damage: {{setvar::hp::{{sub::{{hp}}::15}}}}New HP: {{hp}}`);
      const [output, setOutput] = useState("");
      
      const handleTest = async () => {
          try {
              const res = await invoke<string>('process_macros_debug', { 
                  text: input,
                  characterId: characterId || 0
              });
              setOutput(res);
          } catch(e) { setOutput("Error: " + e); }
      };
  
      return (
          <div className="bg-gray-900/30 p-4 rounded-2xl border border-white/5 space-y-3 mt-6">
              <h3 className="font-bold text-gray-300 flex items-center gap-2"><Bug size={18}/> Macro Playground</h3>
              <div className="grid grid-cols-1 gap-4">
                  <textarea value={input} onChange={e => setInput(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-indigo-500" rows={3} placeholder="Enter macros..." />
                  <div className="bg-black/40 p-3 rounded-xl text-xs font-mono text-gray-400 whitespace-pre-wrap border border-white/5 min-h-[60px]">
                      {output || "// Result will appear here..."}
                  </div>
              </div>
              <div className="flex gap-3">
                  <button onClick={handleTest} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-500/20">Test Macros</button>
                  <button onClick={async () => {
                      try {
                          const res = await invoke("debug_lore_generation");
                          setOutput(JSON.stringify(res, null, 2));
                      } catch(e) { setOutput("Error: " + e); }
                  }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-500/20">Test Lore Logic</button>
              </div>
          </div>
      );
  };
  
  // --- MAIN SETTINGS COMPONENT ---
import { RagSettingsTab } from "./components/RagSettingsTab";

type SettingsProps = {
  onBack: () => void;
  chatId: number | null;
  characterId: number | null;
  addToast: (msg: string, type?: ToastType) => void;
  bgMode: "default" | "custom" | "character";
  setBgMode: (m: "default" | "custom" | "character") => void;
  setCustomBg: (url: string) => void;
  retryEnabled: boolean;
  setRetryEnabled: (v: boolean) => void;
  retryTriggers: string;
  setRetryTriggers: (v: string) => void;
  retryDelay: number;
  setRetryDelay: (v: number) => void;
  markDataChanged: () => void;
};

const TABS = [
  { id: "connection", label: "API Connection", icon: Wifi },
  { id: "ui", label: "Interface & Appearance", icon: Eye },
  {
    id: "textgen",
    label: "AI Response Configuration",
    icon: SlidersHorizontal,
  },
  { id: "formatting", label: "AI Response Formatting", icon: FileText },
  { id: "user_settings", label: "User Settings", icon: UserIcon },
  { id: "persona", label: "Persona Management", icon: UserCircle },
  { id: "world", label: "World Info", icon: Globe },
  { id: "rag", label: "Long-Term Memory", icon: Brain },
  { id: "regex", label: "Regex Scripts", icon: Code },
  { id: "qr", label: "Quick Replies", icon: Zap },
  { id: "sync", label: "Cloud Sync", icon: Cloud },
  { id: "advanced", label: "Advanced", icon: SettingsIcon },
  { id: "extensions", label: "Plugins & Extensions", icon: Puzzle },
];

export const API_TYPES = [
  { value: "chat_completion", label: "Chat Completion" },
  { value: "google", label: "Google Gemini" },
  { value: "text_completion", label: "Text Completion" },
  { value: "novelai", label: "NovelAI" },
  { value: "kobold", label: "KoboldAI Classic" },
  { value: "horde", label: "AI Horde" },
];

export const CHAT_SOURCES = [
  { value: "custom", label: "Custom (OpenAI Compatible)" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "grok", label: "Grok (xAI)" },
];

export const POST_PROCESSING_OPTIONS = [
  { value: "none", label: "None" },
  { value: "tools", label: "Tools Only" },
  { value: "merge", label: "Merge" },
  { value: "merge_tools", label: "Merge + Tools" },
  { value: "semi_strict", label: "Semi-Strict" },
  { value: "semi_strict_tools", label: "Semi-Strict + Tools" },
  { value: "strict", label: "Strict" },
  { value: "strict_tools", label: "Strict + Tools" },
];

export const REASONING_OPTIONS = [
  { value: "none", label: "None (Default)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function Settings({
  onBack,
  chatId,
  characterId,
  addToast,
  bgMode,
  setBgMode,
  setCustomBg,
  retryEnabled,
  setRetryEnabled,
  retryTriggers,
  setRetryTriggers,
  retryDelay,
  setRetryDelay,
  markDataChanged,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState("connection");

  // Data State
  const {
    presetsList,
    activePresetFile,
    setActivePresetFile,
    formData,
    setFormData,
    refreshPresets,
    loadPresetData,
    handleFieldChange,
  } = useActivePreset();
  const [userPersonas, setUserPersonas] = useState<UserPersona[]>([]);
  const [regexScripts, setRegexScripts] = useState<RegexScript[]>([]);

  // Connection Profile State
  const [connectionProfiles, setConnectionProfiles] = useState<string[]>([]);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(
    null,
  );
  const [connectionData, setConnectionData] = useState<ConnectionProfile>(
    DEFAULT_CONNECTION_PROFILE,
  );
  const [uiSettings, setUiSettings] = useState({ msgLimit: 50, contentScale: 1.0 });
  const [chatStyle, setChatStyle] = useState<"bubbles" | "document">((localStorage.getItem("ui_chat_style") as "bubbles" | "document") || "bubbles");

  // UI State
  const [editingModule, setEditingModule] = useState<any | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [isDropboxConnected, setIsDropboxConnected] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isGDriveConnected, setIsGDriveConnected] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(
    localStorage.getItem("cloud_auto_sync") !== "false"
  );
  const [syncProvider, setSyncProvider] = useState<"dropbox" | "gdrive">(
    (localStorage.getItem("sync_provider") as any) || "dropbox"
  );

  useEffect(() => {
      invoke<boolean>("get_dropbox_status").then((status) => {
          setIsDropboxConnected(status);
          localStorage.setItem("dropbox_connected", status.toString());
      });
      invoke<boolean>("get_gdrive_status").then((status) => {
          setIsGDriveConnected(status);
          localStorage.setItem("gdrive_connected", status.toString());
      });

      const unlistenProgress = listen<string>("sync-progress", (event) => {
          setSyncStatus(event.payload);
      });

      return () => {
          unlistenProgress.then((f) => f());
      };
  }, []);

  const handlePush = async () => {
      setIsPushing(true);
      setSyncStatus("Starting...");
      try {
          await invoke("sync_push_all", { provider: syncProvider });
          addToast("Successfully pushed to cloud!", "success");
      } catch (e) {
          addToast("Push failed: " + e, "error");
      } finally {
          setIsPushing(false);
          setSyncStatus(null);
      }
  };

  const handlePull = async () => {
      if (!confirm("Pull from Cloud will overwrite local messages for synced chats. Continue?")) return;
      setIsPulling(true);
      setSyncStatus("Starting...");
      try {
          await invoke("sync_pull_all", { provider: syncProvider });
          addToast("Successfully pulled from cloud!", "success");
          markDataChanged();
          await refreshData();
      } catch (e) {          addToast("Pull failed: " + e, "error");
      } finally {
          setIsPulling(false);
          setSyncStatus(null);
      }
  };
  const [editingScript, setEditingScript] = useState<RegexScript | null>(null);
  const [editingQR, setEditingQR] = useState<QuickReply | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [editingPersona, setEditingPersona] = useState<UserPersona | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [tokenCounts, setTokenCounts] = useState<Record<string, number>>({});

  const updateTokenCounts = async (modules: PromptModule[]) => {
    try {
      const counts = await invoke<Record<string, number>>(
        "get_modules_token_counts",
        {
          modules,
          chatId: chatId || 0,
          characterId: characterId || 0,
        },
      );
      setTokenCounts(counts);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (formData?.prompts) {
      updateTokenCounts(formData.prompts);
    }
  }, [formData, chatId, characterId]);

  // Collapse/Expand state for prompts
  const [allExpanded, setAllExpanded] = useState<boolean | null>(null);

  const fetchRegexScripts = useCallback(async () => {
      try {
          const scripts = await invoke<RegexScript[]>("get_regex_scripts");
          setRegexScripts(scripts);
      } catch (e) { console.error(e); }
  }, []);

  const fetchQuickReplies = useCallback(async () => {
      try {
          const qrs = await invoke<QuickReply[]>("get_quick_replies");
          setQuickReplies(qrs);
      } catch (e) { console.error(e); }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      await refreshPresets();

      try {
        const uList = await invoke<UserPersona[]>("get_user_personas");
        setUserPersonas(uList || []);
      } catch (err) {
        setUserPersonas([]);
      }

      const cList = await invoke<string[]>("list_connection_profiles").catch(
        () => [],
      );
      setConnectionProfiles(cList);
    } catch (e) {
      console.error(e);
    }
  }, []);



  const loadConnectionProfile = useCallback(async (fileName: string) => {
    try {
      setConnectionData(await loadConnectionProfileFile(fileName));
      setActiveProfileName(fileName);
      localStorage.setItem("active_profile", fileName);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Init Effect (Moved here to access load functions)
  useEffect(() => {
    const initSelection = async () => {
      // Load UI Settings
      setUiSettings(loadUiSettingsFromStorage());

      // Load Profiles
      try {
          const cList = await invoke<string[]>("list_connection_profiles");
          const storedProfile = localStorage.getItem("active_profile");
          if (storedProfile && cList.includes(storedProfile)) {
            await loadConnectionProfile(storedProfile);
          } else if (cList.length > 0) {
            await loadConnectionProfile(cList[0]);
          } else {
            setConnectionData(DEFAULT_CONNECTION_PROFILE);
          }
      } catch(e) { console.error(e); }

    };
    initSelection();
  }, [loadConnectionProfile]);

  const handleExportRegex = async () => {
      try {
          const content = JSON.stringify(regexScripts, null, 2);
          const blob = new Blob([content], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "regex_scripts.json";
          a.click();
      } catch(e) { addToast("Error: " + e, "error"); }
  };

  const handleImportRegex = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      try {
          const contents = await Promise.all(
              files.map(
                  (file) =>
                      new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = (ev) => resolve(ev.target?.result as string);
                          reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
                          reader.readAsText(file);
                      }),
              ),
          );

          const scripts = contents.flatMap((content, index) =>
              parseImportedRegexScripts(content, index * 1000 + 1),
          );

          if (scripts.length === 0) {
              addToast("No valid regex scripts found in selected files.", "error");
              return;
          }

          await invoke("import_regex_scripts", { scripts });
          await fetchRegexScripts();
          addToast("Imported " + scripts.length + " scripts.", "success");
      } catch(err) {
          addToast("Invalid JSON: " + err, "error");
      } finally {
          e.target.value = "";
      }
  };

  const handleCreateScript = async () => {
      try {
          await invoke("create_regex_script", { name: "New Script", regex: "", replacement: "", placement: "both" });
          await fetchRegexScripts();
      } catch(e) { addToast("Error: " + e, "error"); }
  };
  
  const handleUpdateScript = async (script: RegexScript) => {
      try {
          await invoke("update_regex_script", { script });
          await fetchRegexScripts();
      } catch(e) { addToast("Error: " + e, "error"); }
  };
  
  const handleDeleteScript = async (id: number) => {
      if (confirm("Delete regex script?")) {
          try {
              await invoke("delete_regex_script", { id });
              await fetchRegexScripts();
          } catch(e) { addToast("Error: " + e, "error"); }
      }
  };

  const handleCreateQR = async () => {
      try {
          await invoke("create_quick_reply", { label: "New QR", content: "/echo Hello", icon: "⚡", isGlobal: true });
          await fetchQuickReplies();
      } catch(e) { addToast("Error: " + e, "error"); }
  };
  
  const handleDeleteQR = async (id: number) => {
      if (confirm("Delete QR?")) {
          try {
              await invoke("delete_quick_reply", { id });
              await fetchQuickReplies();
          } catch(e) { addToast("Error: " + e, "error"); }
      }
  };

  const handleUpdateQR = async (qr: QuickReply) => {
      try {
          await invoke("update_quick_reply", { id: qr.id, label: qr.label, content: qr.content, icon: qr.icon, isGlobal: qr.is_global });
          await fetchQuickReplies();
      } catch(e) { addToast("Error: " + e, "error"); }
  };

  useEffect(() => {
    refreshData();
    fetchRegexScripts();
    fetchQuickReplies();
  }, [refreshData, fetchRegexScripts, fetchQuickReplies]);
  useEffect(() => {
    if (activeProfileName) loadConnectionProfile(activeProfileName);
  }, [activeProfileName, loadConnectionProfile]);

  // --- AUTO SAVE ---
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeProfileName && connectionData) {
        saveConnectionProfileFile(activeProfileName, {
          ...connectionData,
          name: activeProfileName,
        }).catch(console.error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [connectionData, activeProfileName]);

  // --- HANDLERS ---

  const handleConnectionChange = useCallback((
    field: keyof ConnectionProfile,
    value: any,
  ) => {
    setConnectionData((prev) => ({
      ...prev,
      [field]: coerceConnectionFieldValue(field, value),
    }));
  }, []);


  const handleDeleteModule = useCallback((id: string) => {
    if (confirm("Delete module?")) {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              prompts: prev.prompts.filter((p) => p.identifier !== id),
            }
          : null,
      );
    }
  }, []);

  const handleToggleModule = useCallback((id: string) => {
    setFormData((prev) => {
      if (!prev) return null;
      
      const newEnabledState = !prev.prompts.find(p => p.identifier === id)?.enabled;

      const next: any = {
        ...prev,
        prompts: prev.prompts.map((p) =>
          p.identifier === id ? { ...p, enabled: newEnabledState } : p,
        ),
      };
      if ("prompt_order" in prev) {
          next.prompt_order = Array.isArray((prev as any).prompt_order) ? (prev as any).prompt_order.map((po: any) => {
              if (typeof po === "string") return po;
              if (po.order && Array.isArray(po.order)) {
                  return {
                      ...po,
                      order: po.order.map((item: any) => {
                          if (typeof item === "string") return item;
                          if (item.identifier === id) return { ...item, enabled: newEnabledState };
                          return item;
                      })
                  };
              }
              if (po.identifier === id) return { ...po, enabled: newEnabledState };
              return po;
          }) : (prev as any).prompt_order;
      }
      return next;
    });
  }, []);

  const handleExportPreset = async () => {
    if (!formData) return;
    const fileName = prompt(
      "Save Preset As (filename.json):",
      activePresetFile || "NewPreset.json",
    );
    if (fileName) {
      await savePresetFile(fileName, formData);
      await refreshPresets();
      setActivePresetFile(fileName);
    }
  };

  const handleImportPreset = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      alert("Only .json files are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        const normalized = normalizePreset(parsed);

        const fileName = file.name;
        await savePresetFile(fileName, normalized);

        await refreshPresets();
        setActivePresetFile(fileName);
        localStorage.setItem("active_preset", fileName);
        setFormData(normalized);
        addToast(`Imported ${fileName} successfully!`, "success");
      } catch (err: any) {
        console.error("Failed to import preset:", err);
        addToast(`Error importing preset: ${err?.message || JSON.stringify(err)}`, "error");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleSaveConnection = async () => {
    let name = prompt(
      "Save Connection Profile As (e.g. 'OpenAI.json'):",
      activeProfileName || "MyProfile.json",
    );
    if (name) {
      if (!name.toLowerCase().endsWith(".json")) name += ".json";
      const profileToSave = { ...connectionData, name: name };
      await saveConnectionProfileFile(name, profileToSave);
      await refreshData();
      setActiveProfileName(name);
      localStorage.setItem("active_profile", name);
      addToast("Profile Saved!", "success");
    }
  };

  const handleDeletePreset = async () => {
    if (!activePresetFile || activePresetFile === "Default.json") {
      addToast("Cannot delete the default preset.", "error");
      return;
    }
    if (!confirm(`Delete preset ${activePresetFile}?`)) return;
    try {
      await invoke("delete_preset", { fileName: activePresetFile });
      await refreshPresets();
      setActivePresetFile("Default.json");
    } catch (e) {
      addToast("Error: " + e, "error");
    }
  };

  const handleCreatePreset = async () => {
    let name = prompt(
      "New Preset Name (e.g. 'MyPreset.json'):",
      "NewPreset.json",
    );
    if (name) {
      if (!name.toLowerCase().endsWith(".json")) name += ".json";
      await savePresetFile(name, DEFAULT_PRESET_VALUES);
      await refreshPresets();
      setActivePresetFile(name);
    }
  };

  const handleDeleteConnection = async () => {
    if (!activeProfileName || !confirm(`Delete profile ${activeProfileName}?`))
      return;
    try {
      await invoke("delete_connection_profile", { fileName: activeProfileName });
      await refreshData();
      setActiveProfileName(null);
      addToast("Profile deleted.", "info");
    } catch (e) {
      addToast("Failed to delete: " + e, "error");
    }
  };

  const handleSetDefaultPersona = async (id: number) => {
      try {
          await invoke("set_default_persona", { id });
          await refreshData();
      } catch(e) { addToast("Error: " + e, "error"); }
  };

  const handleCreatePersona = async () => {
    try {
      const id = await invoke<number>("create_user_persona", {
        name: "New Persona",
        avatar: "user_default.png",
        description: "",
      });
      await refreshData();
      // Fetch updated list to get the full object
      const list = await invoke<UserPersona[]>("get_user_personas");
      const newPersona = list.find((p) => p.id === id);
      if (newPersona) setEditingPersona(newPersona);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePersona = async (id: number, name: string) => {
    if (confirm(`Delete persona "${name}"?`)) {
      try {
        await invoke("delete_user_persona", { id });
        await refreshData();
      } catch (e) {
        alert("Failed to delete: " + e);
      }
    }
  };

  const handleConnectDropbox = async () => {
      try {
          addToast("Opening browser for Dropbox login...", "info");
          const res = await invoke<string>("connect_dropbox");
          if (res === "success") {
              setIsDropboxConnected(true);
              localStorage.setItem("dropbox_connected", "true");
              addToast("Dropbox connected!", "success");
          }
      } catch (e) {
          addToast("Dropbox connection failed: " + e, "error");
      }
  };

  const handleLogoutDropbox = async () => {
      await invoke("logout_dropbox");
      setIsDropboxConnected(false);
      localStorage.setItem("dropbox_connected", "false");
      addToast("Logged out from Dropbox", "info");
  };

  const handleConnectGDrive = async () => {
      try {
          addToast("Opening browser for Google Drive login...", "info");
          const res = await invoke<string>("connect_gdrive");
          if (res === "success") {
              setIsGDriveConnected(true);
              localStorage.setItem("gdrive_connected", "true");
              addToast("Google Drive connected!", "success");
          }
      } catch (e) {
          addToast("Google Drive connection failed: " + e, "error");
      }
  };

  const handleLogoutGDrive = async () => {
      await invoke("logout_gdrive");
      setIsGDriveConnected(false);
      localStorage.setItem("gdrive_connected", "false");
      addToast("Logged out from Google Drive", "info");
  };

  const handleSyncProviderChange = (provider: "dropbox" | "gdrive") => {
      setSyncProvider(provider);
      localStorage.setItem("sync_provider", provider);
  };

  const handleFetchModels = async () => {
    setFetchedModels([]);
    try {
      const result = await fetchAvailableModels(connectionData);
      setFetchedModels(result.models);
      addToast(result.message, result.type);
    } catch (e: any) {
      console.error(e);
      addToast("Error fetching models: " + e.message, "error");
    }
  };

  const handleUiChange = (field: string, val: number) => {
    setUiSettings((prev) => ({ ...prev, [field]: val }));
    if (field === "msgLimit") localStorage.setItem("ui_msg_limit", val.toString());
    if (field === "contentScale") localStorage.setItem("ui_content_scale", val.toString());
  };

  const renderPromptManager = () => (
    <div className="space-y-4 pt-10 mt-10 border-t border-white/10">
      <div className="flex justify-between items-center bg-gray-900/30 p-4 rounded-2xl border border-white/5">
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Prompts
          </h3>
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            Prompt Manager
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setEditingModule({} as PromptModule)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-900/20"
          >
            <Plus size={16} /> New Module
          </button>
          <div className="w-px h-8 bg-white/10 mx-1" />
          <button
            onClick={() => setAllExpanded(true)}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400"
            title="Expand All"
          >
            <Maximize2 size={18} />
          </button>
          <button
            onClick={() => setAllExpanded(false)}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400"
            title="Collapse All"
          >
            <Minimize2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {(formData?.prompts || []).map((m) => (
          <PromptModuleItem
            key={m.identifier}
            module={m}
            tokenCount={tokenCounts[m.identifier]}
            onEdit={setEditingModule}
            onDelete={handleDeleteModule}
            onToggle={handleToggleModule}
            isAllExpanded={allExpanded}
          />
        ))}
        {(formData?.prompts?.length || 0) === 0 && (
          <div className="text-center py-12 text-gray-600 border-2 border-dashed border-gray-800 rounded-2xl">
            No prompt modules defined.
          </div>
        )}
      </div>
    </div>
  );

  if (!formData)
    return (
      <div className="flex items-center justify-center h-screen h-[100dvh] bg-gray-950 text-white animate-pulse">
        Loading Configuration...
      </div>
    );

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-transparent text-gray-100 font-sans overflow-hidden">
      {editingModule && (
        <ModuleEditor
          module={editingModule}
          onCancel={() => setEditingModule(null)}
          onSave={(m: any) => {
            const prompts = editingModule.identifier
              ? formData.prompts.map((p) =>
                  p.identifier === m.identifier ? m : p,
                )
              : [
                  ...formData.prompts,
                  { ...m, identifier: Date.now().toString() },
                ];

            setFormData({ ...formData, prompts });
            setEditingModule(null);
          }}
        />
      )}

      {editingScript && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
                      <h3 className="text-lg font-bold text-white">Edit Regex Script</h3>
                      <button onClick={() => setEditingScript(null)}><X size={20} className="text-gray-500 hover:text-white"/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                          <input 
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                              value={editingScript.script_name}
                              onChange={(e) => setEditingScript({...editingScript, script_name: e.target.value})}
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">Regex Pattern</label>
                          <input 
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none font-mono"
                              value={editingScript.regex}
                              onChange={(e) => setEditingScript({...editingScript, regex: e.target.value})}
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase">Replacement</label>
                          <textarea 
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none min-h-[80px]"
                              value={editingScript.replacement}
                              onChange={(e) => setEditingScript({...editingScript, replacement: e.target.value})}
                          />
                          <p className="text-xs text-gray-600">Supports macros: <code>{"{{setvar::x::1}}"}</code>. Use <code>$1</code> for capture groups.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-500 uppercase">Placement</label>
                              <select 
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none appearance-none"
                                  value={editingScript.placement}
                                  onChange={(e) => setEditingScript({...editingScript, placement: e.target.value})}
                              >
                                  <option value="both">Both</option>
                                  <option value="user">User Input</option>
                                  <option value="ai">AI Output</option>
                              </select>
                          </div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-white/5 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setEditingScript(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                      <button onClick={() => { handleUpdateScript(editingScript); setEditingScript(null); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">Save Script</button>
                  </div>
              </div>
          </div>
      )}

      {editingQR && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
                      <h3 className="text-lg font-bold text-white">Edit Quick Reply</h3>
                      <button onClick={() => setEditingQR(null)}><X size={20} className="text-gray-500 hover:text-white"/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                      <div className="flex gap-4">
                          <div className="w-1/3">
                              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Icon</label>
                              <input 
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none text-center"
                                  value={editingQR.icon}
                                  onChange={(e) => setEditingQR({...editingQR, icon: e.target.value})}
                                  maxLength={4}
                              />
                          </div>
                          <div className="flex-1">
                              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Label</label>
                              <input 
                                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                  value={editingQR.label}
                                  onChange={(e) => setEditingQR({...editingQR, label: e.target.value})}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Content / Command</label>
                          <textarea 
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none min-h-[80px]"
                              value={editingQR.content}
                              onChange={(e) => setEditingQR({...editingQR, content: e.target.value})}
                              placeholder="/echo Hello or Just text"
                          />
                      </div>
                  </div>
                  <div className="p-6 border-t border-white/5 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setEditingQR(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                      <button onClick={() => { handleUpdateQR(editingQR); setEditingQR(null); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition">Save</button>
                  </div>
              </div>
          </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-gray-900 border-b md:border-r border-white/5 flex flex-col shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="p-4 md:p-6 border-b border-white/5 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-white/5 rounded-full transition text-gray-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg tracking-wide">Settings</h1>
        </div>

        <div className="p-4 md:p-5 border-b border-white/5 bg-gray-900/50 hidden md:block">
          {/* Desktop-only Preset Selector (too big for mobile header) */}
          <div className="flex justify-between items-center mb-3">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              Active Preset
            </label>
            <div className="flex gap-1">
              <button
                onClick={handleCreatePreset}
                className="text-emerald-400 hover:text-emerald-300 transition p-1"
                title="New Preset"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={handleDeletePreset}
                className="text-red-400 hover:text-red-300 transition p-1"
                title="Delete Preset"
              >
                <Trash2 size={16} />
              </button>
              <label
                className="text-gray-500 hover:text-white transition p-1 cursor-pointer"
                title="Debug JSON Structure"
              >
                <Bug size={16} />
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const data = JSON.parse(ev.target?.result as string);
                        let debugInfo = "";

                        const po = data.prompt_order;
                        if (Array.isArray(po)) {
                          debugInfo += `prompt_order array found. Entries: ${po.length}\n\n`;

                          po.forEach((entry: any, idx: number) => {
                            const list = entry.order || [];
                            const hasCover = list.some(
                              (x: any) =>
                                x.identifier ===
                                "99042b44-f91c-4406-9549-2ac7fdfc6dcb",
                            );
                            const hasCore = list.some(
                              (x: any) =>
                                x.identifier ===
                                "4bf72a15-4d72-4306-a216-0ca9801483b3",
                            );

                            debugInfo += `[${idx}] CharID: ${entry.character_id}\n`;
                            debugInfo += `    Count: ${list.length}\n`;
                            debugInfo += `    Has Cover? ${hasCover ? "YES" : "NO"}\n`;
                            debugInfo += `    Has Core? ${hasCore ? "YES" : "NO"}\n\n`;
                          });
                        } else {
                          debugInfo += "prompt_order is NOT an array.\n";
                        }

                        alert(debugInfo);
                      } catch (err) {
                        alert("Error: " + err);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              <label
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                title="Import Preset"
              >
                <Download size={20} />
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportPreset}
                  className="hidden"
                />
              </label>
              <button
                onClick={handleExportPreset}
                className="text-indigo-400 hover:text-indigo-300 transition p-1"
                title="Save Preset"
              >
                <Save size={16} />
              </button>
            </div>
          </div>
          <div className="relative">
            <select
              value={activePresetFile || ""}
              onChange={(e) => setActivePresetFile(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 appearance-none"
            >
              {presetsList.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-2.5 pointer-events-none text-gray-500">
              <ChevronRight size={12} className="rotate-90" />
            </div>
          </div>
        </div>

        <nav className="flex-1 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto p-2 gap-3 md:gap-1 no-scrollbar shrink-0 w-full md:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex items-center gap-2 md:gap-3 px-4 py-2.5 md:px-4 md:py-3 rounded-xl text-sm font-medium transition-all duration-200 group whitespace-nowrap border border-transparent ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 border-indigo-500/50" : "text-gray-400 hover:bg-white/5 hover:text-gray-200 hover:border-white/10"}`}
            >
              <tab.icon
                size={18}
                className={`transition-colors shrink-0 ${activeTab === tab.id ? "text-white" : "text-gray-500 group-hover:text-gray-300"}`}
              />
              {tab.label}
            </button>
          ))}
        </nav>
            <div className="p-4 text-center text-[10px] text-gray-600 border-t border-white/5 hidden md:block">
                TavernRev v1.2.2
            </div>
        </aside>      {/*MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-gray-950 p-4 md:p-8 custom-scrollbar relative md:pt-[calc(2rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-4xl mx-auto pb-20">
          <header className="mb-8 pb-4 border-b border-white/5">
            <h2 className="text-3xl font-bold text-white mb-2">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="text-gray-400">
              Configure your parameters and preferences.
            </p>
          </header>

          {/* --- CONNECTION TAB --- */}
          {activeTab === "connection" && (
            <ConnectionTab
                connectionData={connectionData}
                setConnectionData={setConnectionData}
                activeProfileName={activeProfileName}
                setActiveProfileName={setActiveProfileName}
                connectionProfiles={connectionProfiles}
                handleConnectionChange={handleConnectionChange}
                handleDeleteConnection={handleDeleteConnection}
                handleSaveConnection={handleSaveConnection}
                fetchedModels={fetchedModels}
                handleFetchModels={handleFetchModels}
                retryEnabled={retryEnabled}
                setRetryEnabled={setRetryEnabled}
                retryTriggers={retryTriggers}
                setRetryTriggers={setRetryTriggers}
                retryDelay={retryDelay}
                setRetryDelay={setRetryDelay}
            />
          )}

                    {/* --- UI TAB --- */}

                    {activeTab === "ui" && (
                        <UiTab bgMode={bgMode} setBgMode={setBgMode} setCustomBg={setCustomBg} />
                    )}

          

                    {/* --- TEXT GEN TAB --- */}
                    {activeTab === "textgen" && (
                        <TextGenTab
                            activePresetFile={activePresetFile}
                            presetsList={presetsList}
                            loadPresetData={loadPresetData}
                            handleCreatePreset={handleCreatePreset}
                            handleDeletePreset={handleDeletePreset}
                            handleImportPreset={handleImportPreset}
                            handleExportPreset={handleExportPreset}
                            formData={formData}
                            handleFieldChange={handleFieldChange}
                            renderPromptManager={renderPromptManager}
                        />
                    )}

          {/* --- FORMATTING TAB --- */}
          {activeTab === "formatting" && (
            <FormattingTab connectionData={connectionData} formData={formData} handleFieldChange={handleFieldChange} />
          )}

          {activeTab === "persona" && (
            <PersonaTab
              userPersonas={userPersonas}
              handleCreatePersona={handleCreatePersona}
              handleSetDefaultPersona={handleSetDefaultPersona}
              setEditingPersona={setEditingPersona}
              handleDeletePersona={handleDeletePersona}
            />
          )}

          {activeTab === "regex" && (
            <RegexTab
              regexScripts={regexScripts}
              handleImportRegex={handleImportRegex}
              handleExportRegex={handleExportRegex}
              handleCreateScript={handleCreateScript}
              setEditingScript={setEditingScript}
              handleDeleteScript={handleDeleteScript}
            />
          )}

          {activeTab === "qr" && (
            <QuickRepliesTab
              quickReplies={quickReplies}
              handleCreateQR={handleCreateQR}
              setEditingQR={setEditingQR}
              handleDeleteQR={handleDeleteQR}
            />
          )}

          {editingPersona && (
            <PersonaEditor
              persona={editingPersona}
              onSave={async (p) => {
               try {
                 await invoke("update_user_persona", { persona: p });
                 markDataChanged();
                 await refreshData();
                 setEditingPersona(null);
               } catch (e) {
                 alert("Error: " + e);
               }
              }}              onCancel={() => setEditingPersona(null)}
            />
          )}

          {activeTab === "user_settings" && (
            <UserSettingsTab
              uiSettings={uiSettings}
              handleUiChange={handleUiChange}
              chatStyle={chatStyle}
              setChatStyle={setChatStyle}
              characterId={characterId}
            />
          )}

          {activeTab === "world" && (
            <WorldInfoTab
              formData={formData}
              handleFieldChange={handleFieldChange}
              chatId={chatId}
              characterId={characterId}
              addToast={addToast}
            />
          )}

          {activeTab === "sync" && (
            <SyncTab
              syncProvider={syncProvider}
              handleSyncProviderChange={handleSyncProviderChange}
              isDropboxConnected={isDropboxConnected}
              isGDriveConnected={isGDriveConnected}
              handleConnectDropbox={handleConnectDropbox}
              handleConnectGDrive={handleConnectGDrive}
              handleLogoutDropbox={handleLogoutDropbox}
              handleLogoutGDrive={handleLogoutGDrive}
              handlePush={handlePush}
              handlePull={handlePull}
              isPushing={isPushing}
              isPulling={isPulling}
              syncStatus={syncStatus}
              autoSyncEnabled={autoSyncEnabled}
              setAutoSyncEnabled={setAutoSyncEnabled}
            />
          )}

          {activeTab === "rag" && (
            <RagSettingsTab chatId={chatId} addToast={addToast} />
          )}

          {activeTab === "advanced" && (
            <AdvancedTab addToast={addToast} setShowConsole={setShowConsole} />
          )}

          {activeTab === "extensions" && (
            <ExtensionsTab addToast={addToast} />
          )}
        </div>
      </main>
      
      {showConsole && <DebugConsole onClose={() => setShowConsole(false)} />}
    </div>
  );
}
