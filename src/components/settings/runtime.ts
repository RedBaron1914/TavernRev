import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ConnectionProfile, Preset } from "./shared";
import i18next from 'i18next'

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
  input_sequence: i18next.t('instruction', '### Instruction:\n'),
  output_sequence: i18next.t('response', '### Response:\n'),
  system_sequence: i18next.t('system2', '### System:\n'),
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
  char_avatar_prompt: i18next.t('thisIsYourAppearance', 'This is your appearance.'),
  user_avatar_prompt: i18next.t('thisIsUsersAppearance', 'This is {{user}}\'s appearance.'),
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

  // Pre-process all raw prompts to ensure they have base properties
  rawPrompts = rawPrompts.map((p: any, idx: number) => {
      const originalOrder = p.injection_order !== undefined ? Number(p.injection_order) : (p.depth !== undefined ? Number(p.depth) : 0);
      return {
          ...p,
          identifier: p.identifier || `imported_${idx}_${Date.now()}`,
          name: p.name || "Untitled",
          content: p.content || "",
          role: p.role || "system",
          enabled: p.enabled ?? ["main", "chatHistory", "charDescription"].includes(p.identifier),
          injection_order: originalOrder,
          injection_depth: Number(p.injection_depth ?? p.depth ?? 4),
          injection_position: Number(p.injection_position ?? p.position ?? 0),
          system_prompt: !!p.system_prompt,
          marker: !!p.marker,
          forbid_overrides: !!p.forbid_overrides,
          injection_trigger: Array.isArray(p.injection_trigger) ? p.injection_trigger : [],
          _originalIdx: idx,
      };
  });

  if (promptOrderList.length > 0) {
    const orderMap = new Map();
    const enabledMap = new Map();

    promptOrderList.forEach((item: any, index: number) => {
      const id = typeof item === "string" ? item : (item?.identifier || item?.name);
      if (id) {
        orderMap.set(id, index);
        if (typeof item !== "string" && item.enabled !== undefined) {
          enabledMap.set(id, item.enabled);
        }
      }
    });

    // STRICT SILLYTAVERN BEHAVIOR: Discard orphaned prompts not in prompt_order
    const filteredPrompts = rawPrompts.filter((p: any) => orderMap.has(p.identifier) || (p.name && orderMap.has(p.name)));

    const sortedPrompts = filteredPrompts.map((p: any) => {
      let sortIndex = 0;
      let isEnabled = p.enabled;

      if (orderMap.has(p.identifier)) {
        sortIndex = orderMap.get(p.identifier);
        if (enabledMap.has(p.identifier)) isEnabled = enabledMap.get(p.identifier);
      } else if (p.name && orderMap.has(p.name)) {
        sortIndex = orderMap.get(p.name);
        if (enabledMap.has(p.name)) isEnabled = enabledMap.get(p.name);
      }

      return { ...p, _sortIndex: sortIndex, enabled: isEnabled };
    });

    sortedPrompts.sort((a: any, b: any) => {
        if (a._sortIndex !== b._sortIndex) return a._sortIndex - b._sortIndex;
        return a._originalIdx - b._originalIdx;
    });

    rawPrompts = sortedPrompts;
  } else {
    const defaultOrderMap = new Map(ST_DEFAULT_ORDER.map((id, index) => [id, index]));
    const systemPrompts = [];
    const customPrompts = [];

    for (let i = 0; i < rawPrompts.length; i++) {
      const p = rawPrompts[i];
      if (defaultOrderMap.has(p.identifier)) systemPrompts.push(p);
      else customPrompts.push(p);
    }

    customPrompts.sort((a: any, b: any) => {
      const orderA = a.injection_order;
      const orderB = b.injection_order;
      if (orderA !== orderB) return orderB - orderA; // Descending for custom logic fallback
      return a._originalIdx - b._originalIdx;
    });

    const mappedCustom = customPrompts.map((p: any) => ({
      ...p,
      _sortIndex: p.injection_order,
    }));

    const mappedSystem = systemPrompts.map((p: any) => ({
      ...p,
      _sortIndex: defaultOrderMap.get(p.identifier)! - 10000,
    }));

    rawPrompts = [...mappedCustom, ...mappedSystem];
    rawPrompts.sort((a: any, b: any) => {
        if (a._sortIndex !== b._sortIndex) return a._sortIndex - b._sortIndex;
        return a._originalIdx - b._originalIdx;
    });
  }

  // Remove the temporary _sortIndex and _originalIdx, and force injection_order to match the sorted array index
  const finalPrompts = rawPrompts.map(({ _sortIndex, _originalIdx, ...rest }: any, idx: number) => ({
      ...rest,
      injection_order: idx,
  }));

  return {
    ...DEFAULT_PRESET_VALUES,
    ...data,
    temperature: data.temperature ?? data.temp ?? DEFAULT_PRESET_VALUES.temperature,
    repetition_penalty: data.repetition_penalty ?? data.rep_pen ?? DEFAULT_PRESET_VALUES.repetition_penalty,
    presence_penalty: data.presence_penalty ?? data.pres_pen ?? DEFAULT_PRESET_VALUES.presence_penalty,
    frequency_penalty: data.frequency_penalty ?? data.freq_pen ?? DEFAULT_PRESET_VALUES.frequency_penalty,
    openai_max_tokens: data.openai_max_tokens ?? data.max_length ?? DEFAULT_PRESET_VALUES.openai_max_tokens,
    prompts: finalPrompts,
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
    return { models, message: i18next.t('fetchedLengthHordeModels', 'Fetched {{length}} Horde models.', { length: models.length }), type: "success" as const };
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
      headers: { Authorization: i18next.t('bearerApi_key', 'Bearer {{api_key}}', { api_key: connectionData.api_key }) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id).sort() : [];
    return { models, message: i18next.t('fetchedLengthModels', 'Fetched {{length}} models.', { length: models.length }), type: "success" as const };
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
    return { models, message: i18next.t('fetchedLengthGeminiModels', 'Fetched {{length}} Gemini models.', { length: models.length }), type: "success" as const };
  }

  return {
    models: [] as string[],
    message: i18next.t('modelFetchingNotSupportedForThisApiTypeYet', 'Model fetching not supported for this API type yet.'),
    type: "info" as const,
  };
};

export const useActivePreset = () => {
  const [presetsList, setPresetsList] = useState<string[]>([]);
  const [activePresetFile, setActivePresetFile] = useState<string | null>(null);
  const [formData, setFormData] = useState<Preset | null>(null);

  const refreshPresets = useCallback(async () => {
    const presetFiles = await invoke<string[]>("list_presets");
    setPresetsList(presetFiles);
    return presetFiles;
  }, []);

  const loadPresetData = useCallback(async (fileName: string) => {
    const normalized = await loadPresetFile(fileName);
    setFormData(normalized);
    setActivePresetFile(fileName);
    localStorage.setItem("active_preset", fileName);
    return normalized;
  }, []);

  useEffect(() => {
    const initPresetSelection = async () => {
      try {
        const presetFiles = await refreshPresets();
        const storedPreset = localStorage.getItem("active_preset");

        if (storedPreset && presetFiles.includes(storedPreset)) {
          await loadPresetData(storedPreset);
        } else if (presetFiles.length > 0) {
          await loadPresetData(presetFiles[0]);
        }
      } catch (e) {
        console.error(e);
      }
    };

    initPresetSelection();
  }, [loadPresetData, refreshPresets]);

  useEffect(() => {
    if (activePresetFile) {
      loadPresetData(activePresetFile).catch(console.error);
    }
  }, [activePresetFile, loadPresetData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activePresetFile && formData) {
        savePresetFile(activePresetFile, formData).catch(console.error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [activePresetFile, formData]);

  const handleFieldChange = useCallback((field: keyof Preset, value: unknown) => {
    setFormData((prev) => {
      if (!prev) return null;

      return {
        ...prev,
        [field]: coercePresetFieldValue(field, value),
      };
    });
  }, []);

  return {
    presetsList,
    activePresetFile,
    setActivePresetFile,
    formData,
    setFormData,
    refreshPresets,
    loadPresetData,
    handleFieldChange,
  };
};

export const useActiveConnectionProfile = (defaultProfile: ConnectionProfile) => {
  const [connectionProfiles, setConnectionProfiles] = useState<string[]>([]);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [connectionData, setConnectionData] = useState<ConnectionProfile>(defaultProfile);

  const refreshConnectionProfiles = useCallback(async () => {
    const profileFiles = await invoke<string[]>("list_connection_profiles").catch(() => []);
    setConnectionProfiles(profileFiles);
    return profileFiles;
  }, []);

  const loadConnectionProfile = useCallback(async (fileName: string) => {
    const profile = await loadConnectionProfileFile(fileName);
    setConnectionData(profile);
    setActiveProfileName(fileName);
    localStorage.setItem("active_profile", fileName);
    return profile;
  }, []);

  useEffect(() => {
    const initConnectionSelection = async () => {
      try {
        const profileFiles = await refreshConnectionProfiles();
        const storedProfile = localStorage.getItem("active_profile");

        if (storedProfile && (profileFiles as string[]).includes(storedProfile)) {
          await loadConnectionProfile(storedProfile);
        } else if (profileFiles.length > 0) {
          await loadConnectionProfile(profileFiles[0]);
        } else {
          setConnectionData(defaultProfile);
        }
      } catch (e) {
        console.error(e);
      }
    };

    initConnectionSelection();
  }, [defaultProfile, loadConnectionProfile, refreshConnectionProfiles]);

  useEffect(() => {
    if (activeProfileName) {
      loadConnectionProfile(activeProfileName).catch(console.error);
    }
  }, [activeProfileName, loadConnectionProfile]);

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
  }, [activeProfileName, connectionData]);

  const handleConnectionChange = useCallback(
    (field: keyof ConnectionProfile, value: unknown) => {
      setConnectionData((prev) => ({
        ...prev,
        [field]: coerceConnectionFieldValue(field, value),
      }));
    },
    [],
  );

  return {
    connectionProfiles,
    activeProfileName,
    setActiveProfileName,
    connectionData,
    setConnectionData,
    refreshConnectionProfiles,
    loadConnectionProfile,
    handleConnectionChange,
  };
};
