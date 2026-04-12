import { invoke } from "@tauri-apps/api/core";
import { ConnectionProfile, Preset } from "./shared";

export const DEFAULT_PRESET_VALUES: Preset = {
  model_name: "",
  temperature: 1.0,
  top_p: 0.8,
  top_k: 0,
  top_a: 0,
  min_p: 0,
  repetition_penalty: 1.0,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  openai_max_tokens: 4096,
  stream_openai: true,
  seed: -1,
  prompts: [],
  impersonation_prompt: "",
  continue_nudge_prompt: "",
  stop_strings: "",
  instruct_mode_enabled: true,
  input_sequence: "### Instruction:\n",
  output_sequence: "### Response:\n",
  system_sequence: "### System:\n",
  wi_format: "{0}",
  scenario_format: "{{scenario}}",
  personality_format: "{{personality}}",
  names_behavior: 0,
  send_if_empty: "",
  new_chat_prompt: "",
  new_group_chat_prompt: "",
  new_example_chat_prompt: "",
  group_nudge_prompt: "",
  assistant_prefill: "",
  assistant_impersonation: "",
  reasoning_effort: "",
  show_thoughts: true,
  wi_scan_depth: 5,
  wi_recursive: true,
  wi_case_sensitive: false,
  wi_match_whole_words: true,
  wi_max_recursion: 5,
  wi_token_budget: 0,
  wi_context_percent: 0,
  wi_include_names: true,
  wi_insertion_strategy: "char_first",
  squash_system_messages: false,
  request_images: true,
  send_char_avatar: false,
  send_user_avatar: false,
  char_avatar_prompt: "This is your appearance.",
  user_avatar_prompt: "This is {{user}}'s appearance.",
};

const ST_DEFAULT_ORDER = [
  "main",
  "worldInfoBefore",
  "personaDescription",
  "charDescription",
  "charPersonality",
  "scenario",
  "enhanceDefinitions",
  "nsfw",
  "worldInfoAfter",
  "dialogueExamples",
  "chatHistory",
  "jailbreak",
  "groupNudge",
];

const PRESET_NUMERIC_FIELDS = new Set<keyof Preset>([
  "temperature",
  "top_p",
  "top_k",
  "top_a",
  "min_p",
  "repetition_penalty",
  "presence_penalty",
  "frequency_penalty",
  "openai_max_tokens",
  "seed",
  "wi_scan_depth",
  "wi_max_recursion",
  "wi_token_budget",
  "wi_context_percent",
]);

export const loadUiSettingsFromStorage = () => ({
  msgLimit: parseInt(localStorage.getItem("ui_msg_limit") || "50"),
  contentScale: parseFloat(localStorage.getItem("ui_content_scale") || "1.0"),
});

export const coercePresetFieldValue = (field: keyof Preset, value: unknown) =>
  PRESET_NUMERIC_FIELDS.has(field) ? Number(value) : value;

export const coerceConnectionFieldValue = (
  field: keyof ConnectionProfile,
  value: unknown,
) => (field === "context_size" ? Number(value) : value);

export const normalizePreset = (data: any): Preset => {
  let rawPrompts = Array.isArray(data.prompts) ? data.prompts : [];
  let promptOrderList: any[] = [];

  if (Array.isArray(data.prompt_order) && data.prompt_order.length > 0) {
    if (data.prompt_order[0].order && Array.isArray(data.prompt_order[0].order)) {
      const entry = data.prompt_order.reduce((prev: any, current: any) => {
        const prevLen = Array.isArray(prev?.order) ? prev.order.length : 0;
        const currLen = Array.isArray(current?.order) ? current.order.length : 0;
        return currLen > prevLen ? current : prev;
      }, data.prompt_order[0]);

      promptOrderList = entry?.order || [];
    } else {
      promptOrderList = data.prompt_order;
    }
  }

  if (promptOrderList.length > 0) {
    const orderMap = new Map();
    const enabledMap = new Map();

    promptOrderList.forEach((item: any, index: number) => {
      const id = typeof item === "string" ? item : item?.identifier;
      if (id) {
        orderMap.set(id, index);
        if (typeof item !== "string" && item.enabled !== undefined) {
          enabledMap.set(id, item.enabled);
        }
      }
    });

    rawPrompts = rawPrompts.map((p: any, idx: number) => {
      let sortIndex = 999999;
      let isEnabled = p.enabled ?? false;

      if (orderMap.has(p.identifier)) {
        sortIndex = orderMap.get(p.identifier);
        if (enabledMap.has(p.identifier)) isEnabled = enabledMap.get(p.identifier);
      } else if (p.name && orderMap.has(p.name)) {
        sortIndex = orderMap.get(p.name);
        if (enabledMap.has(p.name)) isEnabled = enabledMap.get(p.name);
      } else {
        sortIndex = 999999 + idx;
      }

      return { ...p, _sortIndex: sortIndex, enabled: isEnabled };
    });

    rawPrompts.sort((a: any, b: any) => a._sortIndex - b._sortIndex);
  } else {
    const defaultOrderMap = new Map(ST_DEFAULT_ORDER.map((id, index) => [id, index]));
    const systemPrompts = [];
    const customPrompts = [];

    for (let i = 0; i < rawPrompts.length; i++) {
      const p = rawPrompts[i];
      p._originalIdx = i;
      if (defaultOrderMap.has(p.identifier)) systemPrompts.push(p);
      else customPrompts.push(p);
    }

    customPrompts.sort((a: any, b: any) => {
      const orderA = Number(a.injection_order ?? a.depth ?? 0);
      const orderB = Number(b.injection_order ?? b.depth ?? 0);
      if (orderA !== orderB) return orderB - orderA;
      return a._originalIdx - b._originalIdx;
    });

    const mappedCustom = customPrompts.map((p: any, idx: number) => ({
      ...p,
      _sortIndex: -10000 + idx,
      enabled: p.enabled ?? true,
    }));

    const mappedSystem = systemPrompts.map((p: any) => ({
      ...p,
      _sortIndex: defaultOrderMap.get(p.identifier)!,
      enabled:
        p.enabled ?? ["main", "chatHistory", "charDescription"].includes(p.identifier),
    }));

    rawPrompts = [...mappedCustom, ...mappedSystem];
    rawPrompts.sort((a: any, b: any) => a._sortIndex - b._sortIndex);
  }

  rawPrompts = rawPrompts.map((p: any, idx: number) => ({
    ...p,
    injection_order: idx,
  }));

  return {
    ...DEFAULT_PRESET_VALUES,
    ...data,
    temperature: data.temperature ?? data.temp ?? DEFAULT_PRESET_VALUES.temperature,
    repetition_penalty:
      data.repetition_penalty ?? data.rep_pen ?? DEFAULT_PRESET_VALUES.repetition_penalty,
    presence_penalty:
      data.presence_penalty ?? data.pres_pen ?? DEFAULT_PRESET_VALUES.presence_penalty,
    frequency_penalty:
      data.frequency_penalty ?? data.freq_pen ?? DEFAULT_PRESET_VALUES.frequency_penalty,
    openai_max_tokens:
      data.openai_max_tokens ?? data.max_length ?? DEFAULT_PRESET_VALUES.openai_max_tokens,
    prompts: rawPrompts.map((p: any, idx: number) => ({
      ...p,
      identifier: p.identifier || `imported_${idx}_${Date.now()}`,
      name: p.name || "Untitled",
      content: p.content || "",
      role: p.role || "system",
      enabled:
        p.enabled ?? ["main", "chatHistory", "charDescription"].includes(p.identifier),
      injection_order: Number(p.injection_order ?? p.depth ?? 0),
      injection_depth: Number(p.injection_depth ?? p.depth ?? 4),
      injection_position: Number(p.injection_position ?? p.position ?? 0),
      system_prompt: !!p.system_prompt,
      marker: !!p.marker,
      forbid_overrides: !!p.forbid_overrides,
      injection_trigger: Array.isArray(p.injection_trigger) ? p.injection_trigger : [],
    })),
  };
};

export const loadPresetFile = async (fileName: string) => {
  const content = await invoke<string>("load_preset", { fileName });
  return normalizePreset(JSON.parse(content));
};

export const loadConnectionProfileFile = async (fileName: string) => {
  const content = await invoke<string>("load_connection_profile", { fileName });
  return JSON.parse(content) as ConnectionProfile;
};

export const savePresetFile = async (fileName: string, preset: Preset) => {
  await invoke("save_preset", {
    fileName,
    content: JSON.stringify(preset, null, 2),
  });
};

export const saveConnectionProfileFile = async (
  fileName: string,
  profile: ConnectionProfile,
) => {
  await invoke("save_connection_profile", {
    fileName,
    content: JSON.stringify(profile, null, 2),
  });
};

export const fetchAvailableModels = async (connectionData: ConnectionProfile) => {
  if (connectionData.api_type === "horde") {
    const res = await fetch("https://stablehorde.net/api/v2/status/models?type=text");
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const models = data.map((m: any) => m.name).sort();
    return { models, message: `Fetched ${models.length} Horde models.`, type: "success" as const };
  }

  if (
    connectionData.api_type === "chat_completion" ||
    connectionData.api_type === "text_completion"
  ) {
    let url = connectionData.base_url;
    if (connectionData.chat_source === "openai") url = "https://api.openai.com/v1";
    if (connectionData.chat_source === "deepseek") url = "https://api.deepseek.com";
    if (connectionData.chat_source === "grok") url = "https://api.x.ai/v1";

    url = url.replace(/\/chat\/completions\/?$/, "").replace(/\/completions\/?$/, "");
    if (url.endsWith("/")) url = url.slice(0, -1);

    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${connectionData.api_key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id).sort() : [];
    return { models, message: `Fetched ${models.length} models.`, type: "success" as const };
  }

  if ((connectionData.api_type as string) === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${connectionData.api_key}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => m.name.replace("models/", ""))
      .sort();
    return { models, message: `Fetched ${models.length} Gemini models.`, type: "success" as const };
  }

  return {
    models: [] as string[],
    message: "Model fetching not supported for this API type yet.",
    type: "info" as const,
  };
};
