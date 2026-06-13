import React, { useEffect, useState } from "react";
import { Bug, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'

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
  studio_assistant_prompt: string;
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

export const DEFAULT_CONNECTION_PROFILE: ConnectionProfile = {
  name: i18next.t('default', 'Default'),
  api_type: "chat_completion",
  chat_source: "custom",
  base_url: "http://127.0.0.1:5000/v1",
  api_key: "",
  model_id: "",
  post_processing: "none",
  context_size: 4096,
};

export const API_TYPES = [
  { value: "chat_completion", labelKey: "chatCompletion", label: "Chat Completion" },
  { value: "google", labelKey: "googleGemini", label: "Google Gemini" },
  { value: "text_completion", labelKey: "textCompletion", label: "Text Completion" },
  { value: "novelai", labelKey: "novelai", label: "NovelAI" },
  { value: "kobold", labelKey: "koboldaiClassic", label: "KoboldAI Classic" },
  { value: "horde", labelKey: "aiHorde", label: "AI Horde" },
];

export const CHAT_SOURCES = [
  { value: "custom", labelKey: "customOpenaiCompatible", label: "Custom (OpenAI Compatible)" },
  { value: "openai", labelKey: "openai", label: "OpenAI" },
  { value: "claude", labelKey: "claudeAnthropic", label: "Claude (Anthropic)" },
  { value: "deepseek", labelKey: "deepseek", label: "DeepSeek" },
  { value: "grok", labelKey: "grokXai", label: "Grok (xAI)" },
];

export const POST_PROCESSING_OPTIONS = [
  { value: "none", labelKey: "none", label: "None" },
  { value: "tools", labelKey: "toolsOnly", label: "Tools Only" },
  { value: "merge", labelKey: "merge", label: "Merge" },
  { value: "merge_tools", labelKey: "mergeTools", label: "Merge + Tools" },
  { value: "semi_strict", labelKey: "semistrict", label: "Semi-Strict" },
  { value: "semi_strict_tools", labelKey: "semistrictTools", label: "Semi-Strict + Tools" },
  { value: "strict", labelKey: "strict", label: "Strict" },
  { value: "strict_tools", labelKey: "strictTools", label: "Strict + Tools" },
];

export const REASONING_OPTIONS = [
  { value: "none", labelKey: "noneDefault", label: "None (Default)" },
  { value: "low", labelKey: "low", label: "Low" },
  { value: "medium", labelKey: "medium", label: "Medium" },
  { value: "high", labelKey: "high", label: "High" },
];

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

export const SelectField = ({ label, value, onChange, options }: any) => {
  const { t } = useTranslation();
  return (
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
              {opt.labelKey ? t(opt.labelKey, opt.label) : opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-3 pointer-events-none text-gray-500">
          <ChevronRight size={14} className="rotate-90" />
        </div>
      </div>
    </div>
  );
};

export const MacroTester = ({ characterId }: { characterId: number | null }) => {
  const { t } = useTranslation()
  const [input, setInput] = useState(`Math: 10 + 5 = {{add::10::5}}
Logic: 10 > 5 is {{gt::10::5}}
Var: {{setvar::hp::100}}HP: {{getvar::hp}}
Damage: {{setvar::hp::{{sub::{{hp}}::15}}}}New HP: {{hp}}`);
  const [output, setOutput] = useState("");

  const handleTest = async () => {
    try {
      const res = await invoke<string>("process_macros_debug", {
        text: input,
        characterId: characterId || 0,
      });
      setOutput(res);
    } catch (e) {
      setOutput("Error: " + e);
    }
  };

  return (
    <div className="bg-gray-900/30 p-4 rounded-2xl border border-white/5 space-y-3 mt-6">
      <h3 className="font-bold text-gray-300 flex items-center gap-2">
        <Bug size={18} /> {t('macroPlayground', 'Macro Playground')}
      </h3>
      <div className="grid grid-cols-1 gap-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-indigo-500"
          rows={3}
          placeholder={t('enterMacros', 'Enter macros...')}
        />
        <div className="bg-black/40 p-3 rounded-xl text-xs font-mono text-gray-400 whitespace-pre-wrap border border-white/5 min-h-[60px]">
          {output || "// Result will appear here..."}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleTest}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-500/20"
        >
          {t('testMacros', 'Test Macros')}
        </button>
        <button
          onClick={async () => {
            try {
              const res = await invoke("debug_lore_generation");
              setOutput(JSON.stringify(res, null, 2));
            } catch (e) {
              setOutput("Error: " + e);
            }
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-500/20"
        >
          {t('testLoreLogic', 'Test Lore Logic')}
        </button>
      </div>
    </div>
  );
};
