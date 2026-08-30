import React, { useState, useEffect } from "react";
import { Preset, ImageGenPreset, DEFAULT_SD_TOOL_DESCRIPTION, SD_PROVIDERS, SD_SAMPLERS, SelectField, InputField, Slider, Toggle } from "./shared";
import { useTranslation } from 'react-i18next';
import { RefreshCw, Image, Save, Plus, Trash2, Sparkles, Sliders } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

type ImageGenerationTabProps = {
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
  addToast: (msg: string, type: "success" | "error" | "info") => void;
};

export const ImageGenerationTab: React.FC<ImageGenerationTabProps> = ({
  formData,
  handleFieldChange,
  addToast,
}) => {
  const { t } = useTranslation('common');
  const getCachedList = (key: string, defaultList: any[]) => {
    const cached = localStorage.getItem(key);
    if (cached) {
      try { return JSON.parse(cached); } catch { return defaultList; }
    }
    return defaultList;
  };

  const [imagePresets, setImagePresets] = useState<string[]>([]);
  const [activeImagePreset, setActiveImagePreset] = useState<string>(() => localStorage.getItem("active_image_preset") || "Default.json");
  const [showNewPresetModal, setShowNewPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<{value: string, label: string}[]>(() => getCachedList("sd_models", [{ value: "stable_diffusion", label: "stable_diffusion" }]));
  const [a1111Samplers, setA1111Samplers] = useState<{value: string, label: string}[]>(() => getCachedList("sd_samplers", []));
  const [a1111Vaes, setA1111Vaes] = useState<{value: string, label: string}[]>(() => getCachedList("sd_vaes", []));
  const [a1111Upscalers, setA1111Upscalers] = useState<{value: string, label: string}[]>(() => getCachedList("sd_upscalers", []));
  const [a1111Schedulers, setA1111Schedulers] = useState<{value: string, label: string}[]>(() => getCachedList("sd_schedulers", []));
  const [swarmModels, setSwarmModels] = useState<{value: string, label: string}[]>(() => getCachedList("sd_swarm_models", []));
  const [swarmSamplers, setSwarmSamplers] = useState<{value: string, label: string}[]>(() => getCachedList("sd_swarm_samplers", []));

  const fetchPresetsList = async () => {
    try {
      const list = await invoke<string[]>("list_image_presets");
      if (list && list.length > 0) {
        setImagePresets(list);
      }
    } catch (e) {
      console.error("Failed to list image presets", e);
    }
  };

  useEffect(() => {
    fetchPresetsList();
  }, []);

  const handleSelectImagePreset = async (fileName: string) => {
    try {
      const jsonStr = await invoke<string>("load_image_preset", { fileName });
      const parsed: ImageGenPreset = JSON.parse(jsonStr);
      
      const sdKeys: (keyof Preset)[] = [
        "sd_provider", "sd_model", "sd_sampler", "sd_width", "sd_height", "sd_steps",
        "sd_cfg_scale", "sd_seed", "sd_positive_prompt", "sd_negative_prompt", "sd_send_loras",
        "sd_tool_description",
        "sd_allow_nsfw", "sd_sanitize_prompts", "sd_restore_faces", "sd_karras", "sd_hires_fix",
        "sd_auto_url", "sd_auto_auth", "sd_auto_vae", "sd_auto_scheduler", "sd_auto_upscaler",
        "sd_auto_hires_steps", "sd_auto_clip_skip", "sd_auto_denoising", "sd_auto_upscale_by",
        "sd_swarm_url", "sd_swarm_auth_token", "sd_swarm_refiner_model", "sd_swarm_refiner_method",
        "sd_swarm_refiner_control_percent", "sd_swarm_refiner_upscale_size", "sd_swarm_refiner_steps",
        "sd_horde_api_key", "sd_use_tool", "sd_edit_prompts"
      ];

      sdKeys.forEach(k => {
        if ((parsed as any)[k] !== undefined) {
          handleFieldChange(k, (parsed as any)[k]);
        }
      });

      setActiveImagePreset(fileName);
      localStorage.setItem("active_image_preset", fileName);
      addToast(t('imagePresetLoaded', 'Loaded image preset: {{name}}', { name: fileName.replace('.json', '') }), "info");
    } catch (e: any) {
      addToast("Failed to load preset: " + e.toString(), "error");
    }
  };

  const handleSaveCurrentPreset = async (targetFile?: string) => {
    const fileToSave = targetFile || activeImagePreset || "Default.json";
    const presetData: ImageGenPreset = {
      name: fileToSave.replace('.json', ''),
      sd_provider: formData.sd_provider,
      sd_model: formData.sd_model,
      sd_sampler: formData.sd_sampler,
      sd_width: formData.sd_width,
      sd_height: formData.sd_height,
      sd_steps: formData.sd_steps,
      sd_cfg_scale: formData.sd_cfg_scale,
      sd_seed: formData.sd_seed,
      sd_positive_prompt: formData.sd_positive_prompt || "",
      sd_negative_prompt: formData.sd_negative_prompt || "",
      sd_send_loras: formData.sd_send_loras || false,
      sd_tool_description: formData.sd_tool_description || DEFAULT_SD_TOOL_DESCRIPTION,
      sd_allow_nsfw: formData.sd_allow_nsfw,
      sd_sanitize_prompts: formData.sd_sanitize_prompts,
      sd_restore_faces: formData.sd_restore_faces,
      sd_karras: formData.sd_karras,
      sd_hires_fix: formData.sd_hires_fix,
      sd_auto_url: formData.sd_auto_url,
      sd_auto_auth: formData.sd_auto_auth,
      sd_auto_vae: formData.sd_auto_vae,
      sd_auto_scheduler: formData.sd_auto_scheduler,
      sd_auto_upscaler: formData.sd_auto_upscaler,
      sd_auto_hires_steps: formData.sd_auto_hires_steps,
      sd_auto_clip_skip: formData.sd_auto_clip_skip,
      sd_auto_denoising: formData.sd_auto_denoising,
      sd_auto_upscale_by: formData.sd_auto_upscale_by,
      sd_swarm_url: formData.sd_swarm_url,
      sd_swarm_auth_token: formData.sd_swarm_auth_token,
      sd_swarm_refiner_model: formData.sd_swarm_refiner_model,
      sd_swarm_refiner_method: formData.sd_swarm_refiner_method,
      sd_swarm_refiner_control_percent: formData.sd_swarm_refiner_control_percent,
      sd_swarm_refiner_upscale_size: formData.sd_swarm_refiner_upscale_size,
      sd_swarm_refiner_steps: formData.sd_swarm_refiner_steps,
      sd_horde_api_key: formData.sd_horde_api_key,
      sd_use_tool: formData.sd_use_tool,
      sd_edit_prompts: formData.sd_edit_prompts,
    };

    try {
      const fileNameWithExt = fileToSave.endsWith('.json') ? fileToSave : `${fileToSave}.json`;
      await invoke("save_image_preset", {
        fileName: fileNameWithExt,
        content: JSON.stringify(presetData, null, 2)
      });
      await fetchPresetsList();
      setActiveImagePreset(fileNameWithExt);
      localStorage.setItem("active_image_preset", fileNameWithExt);
      addToast(t('imagePresetSaved', 'Saved image preset: {{name}}', { name: fileNameWithExt.replace('.json', '') }), "success");
    } catch (e: any) {
      addToast("Failed to save preset: " + e.toString(), "error");
    }
  };

  const handleCreateNewPreset = async () => {
    if (!newPresetName.trim()) return;
    const cleanName = newPresetName.trim();
    const fileName = cleanName.endsWith('.json') ? cleanName : `${cleanName}.json`;
    await handleSaveCurrentPreset(fileName);
    setShowNewPresetModal(false);
    setNewPresetName("");
  };

  const handleDeleteCurrentPreset = async () => {
    if (!activeImagePreset || activeImagePreset === "Default.json") {
      addToast(t('cannotDeleteDefault', 'Cannot delete Default preset'), "error");
      return;
    }
    if (!confirm(t('confirmDeletePreset', 'Are you sure you want to delete this preset?'))) return;

    try {
      await invoke("delete_image_preset", { fileName: activeImagePreset });
      addToast(t('imagePresetDeleted', 'Preset deleted'), "info");
      await fetchPresetsList();
      await handleSelectImagePreset("Default.json");
    } catch (e: any) {
      addToast("Failed to delete preset: " + e.toString(), "error");
    }
  };

  type HordeModelInfo = {
    name: string;
    count: number;
    queued: number;
    eta: number;
  };

  const handleFetchHordeModels = async (silent = false) => {
    try {
      setFetchingModels(true);
      const models = await invoke<HordeModelInfo[]>("get_horde_models");
      if (models && models.length > 0) {
        const modelsList = [
          { value: "", label: t('anyModel', 'Any Model') },
          ...models.map(m => ({ 
            value: m.name, 
            label: `${m.name} (W: ${Math.round(m.count)}, Q: ${Math.round(m.queued)}, ETA: ${Math.round(m.eta)}s)` 
          }))
        ];
        setAvailableModels(modelsList);
        localStorage.setItem("sd_models", JSON.stringify(modelsList));
        if (!silent) addToast(`Fetched ${models.length} models`, "success");
      }
    } catch (e: any) {
      if (!silent) addToast(`Failed to fetch models: ${e}`, "error");
    } finally {
      setFetchingModels(false);
    }
  };

  type A1111ModelInfo = {
    title: string;
    model_name: string;
  };

  const handleFetchA1111Data = async (silent = false) => {
    if (!formData.sd_auto_url) {
      if (!silent) addToast("Please enter A1111 URL first", "error");
      return;
    }
    try {
      setFetchingModels(true);
      const url = formData.sd_auto_url;
      const auth = formData.sd_auto_auth || "";
      
      const [models, samplers, vaes, upscalers, schedulers] = await Promise.all([
        invoke<A1111ModelInfo[]>("get_a1111_models", { url, auth }).catch((e) => { console.warn("Failed models", e); return []; }),
        invoke<A1111ModelInfo[]>("get_a1111_samplers", { url, auth }).catch((e) => { console.warn("Failed samplers", e); return []; }),
        invoke<A1111ModelInfo[]>("get_a1111_vaes", { url, auth }).catch((e) => { console.warn("Failed vaes", e); return []; }),
        invoke<A1111ModelInfo[]>("get_a1111_upscalers", { url, auth }).catch((e) => { console.warn("Failed upscalers", e); return []; }),
        invoke<A1111ModelInfo[]>("get_a1111_schedulers", { url, auth }).catch((e) => { console.warn("Failed schedulers", e); return []; })
      ]);

      if (models.length) {
        const mapped = models.map(m => ({ value: m.title, label: m.model_name }));
        setAvailableModels(mapped);
        localStorage.setItem("sd_models", JSON.stringify(mapped));
      }
      if (samplers.length) {
        const mapped = samplers.map(m => ({ value: m.title, label: m.model_name }));
        setA1111Samplers(mapped);
        localStorage.setItem("sd_samplers", JSON.stringify(mapped));
      }
      if (vaes.length) {
        const mapped = vaes.map(m => ({ value: m.title, label: m.model_name }));
        setA1111Vaes(mapped);
        localStorage.setItem("sd_vaes", JSON.stringify(mapped));
      }
      if (upscalers.length) {
        const mapped = upscalers.map(m => ({ value: m.title, label: m.model_name }));
        setA1111Upscalers(mapped);
        localStorage.setItem("sd_upscalers", JSON.stringify(mapped));
      }
      if (schedulers.length) {
        const mapped = schedulers.map(m => ({ value: m.title, label: m.model_name }));
        setA1111Schedulers(mapped);
        localStorage.setItem("sd_schedulers", JSON.stringify(mapped));
      }

      if (!silent) {
        if (!models.length && !samplers.length) {
          addToast("Failed to fetch data from A1111. Ensure URL is correct and --api is enabled.", "error");
        } else {
          addToast("Fetched A1111 data successfully", "success");
        }
      }
    } catch (e: any) {
      if (!silent) addToast(`Failed to fetch A1111 data: ${e}`, "error");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleFetchSwarmData = async (silent = false) => {
    if (!formData.sd_swarm_url) {
      if (!silent) addToast("Please enter SwarmUI URL first", "error");
      return;
    }
    try {
      setFetchingModels(true);
      const url = formData.sd_swarm_url;
      const auth = formData.sd_swarm_auth_token || "";

      const [models, samplers] = await Promise.all([
        invoke<A1111ModelInfo[]>("get_swarm_models", { url, auth }).catch((e) => { console.warn("Failed Swarm models", e); return []; }),
        invoke<A1111ModelInfo[]>("get_swarm_samplers", { url, auth }).catch((e) => { console.warn("Failed Swarm samplers", e); return []; })
      ]);

      if (models.length) {
        const mapped = models.map(m => ({ value: m.title, label: m.model_name }));
        setSwarmModels(mapped);
        localStorage.setItem("sd_swarm_models", JSON.stringify(mapped));
      }
      if (samplers.length) {
        const mapped = samplers.map(m => ({ value: m.title, label: m.model_name }));
        setSwarmSamplers(mapped);
        localStorage.setItem("sd_swarm_samplers", JSON.stringify(mapped));
      }

      if (!silent) {
        if (!models.length && !samplers.length) {
          addToast("Failed to fetch data from SwarmUI. Ensure URL is correct and SwarmUI is running.", "error");
        } else {
          addToast(`Fetched ${models.length} models and ${samplers.length} samplers from SwarmUI`, "success");
        }
      }
    } catch (e: any) {
      if (!silent) addToast(`Failed to fetch SwarmUI data: ${e}`, "error");
    } finally {
      setFetchingModels(false);
    }
  };

  // Cache/Auto-fetch on mount
  useEffect(() => {
    if (formData.sd_provider === "horde") {
      handleFetchHordeModels(true);
    } else if (formData.sd_provider === "auto" && formData.sd_auto_url) {
      handleFetchA1111Data(true);
    } else if (formData.sd_provider === "swarm" && formData.sd_swarm_url) {
      handleFetchSwarmData(true);
    }
  }, [formData.sd_provider]); // Intentionally not including URLs to avoid spamming while typing

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Image className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{t('imageGeneration', 'Image Generation')}</h3>
              <p className="text-sm text-gray-400">{t('sdSettingsDesc', 'Settings for generating images via Stable Diffusion')}</p>
            </div>
          </div>

          {/* Preset Selector Toolbar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-300 block mb-1">{t('imagePreset', 'Image Preset')}</label>
                <select
                  value={activeImagePreset}
                  onChange={(e) => handleSelectImagePreset(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  {imagePresets.map(p => (
                    <option key={p} value={p}>{p.replace('.json', '')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleSaveCurrentPreset()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
                title={t('savePreset', 'Save Preset')}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('save', 'Save')}</span>
              </button>

              <button
                onClick={() => {
                  setNewPresetName(activeImagePreset.replace('.json', '') + " Copy");
                  setShowNewPresetModal(true);
                }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                title={t('newPreset', 'New Preset')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('newPreset', 'New')}</span>
              </button>

              {activeImagePreset !== "Default.json" && (
                <button
                  onClick={handleDeleteCurrentPreset}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition"
                  title={t('deletePreset', 'Delete Preset')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Base Positive & Negative Prompts Section */}
          <div className="space-y-4 border-t border-white/5 pt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-semibold text-white/90">{t('basePromptsHeader', 'Base Quality & Style Prompts')}</h4>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    {t('basePositivePrompt', 'Base Positive Prompt (Quality Tags / Style Prefix)')}
                  </label>
                </div>
                <textarea
                  value={formData.sd_positive_prompt || ""}
                  onChange={(e) => handleFieldChange("sd_positive_prompt", e.target.value)}
                  placeholder={t('basePositivePlaceholder', 'masterpiece, best quality, ultra-detailed, cinematic lighting')}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none resize-y min-h-[60px]"
                  rows={2}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t('basePositivePromptHelp', 'Automatically prepended to all image generation requests (before user/tool prompt).')}
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    {t('baseNegativePrompt', 'Base Negative Prompt (Unwanted Quality / Embeddings)')}
                  </label>
                </div>
                <textarea
                  value={formData.sd_negative_prompt || ""}
                  onChange={(e) => handleFieldChange("sd_negative_prompt", e.target.value)}
                  placeholder={t('baseNegativePlaceholder', 'worst quality, low quality, bad anatomy, bad hands, missing fingers, extra digits, blurry, watermark')}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none resize-y min-h-[60px]"
                  rows={2}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t('baseNegativePromptHelp', 'Automatically added to the negative prompt for all image generation requests.')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-white/5 pt-4">
            <Toggle
              label={t('useToolCalling', 'Use Tool Calling')}
              field="sd_use_tool"
              value={formData.sd_use_tool}
              onChange={handleFieldChange}
              helpText={t('sdUseToolHelp', 'Allow the AI to automatically request images during chat.')}
            />
            <Toggle
              label={t('editPromptsBeforeGeneration', 'Edit prompts before generation')}
              field="sd_edit_prompts"
              value={formData.sd_edit_prompts}
              onChange={handleFieldChange}
              helpText={t('sdEditPromptsHelp', 'Show a popup to edit the LLM\'s prompt before actually generating the image.')}
            />
            <Toggle
              label={t('sendLorasToAi', 'Send available LoRAs to AI (at initial generation loop)')}
              field="sd_send_loras"
              value={formData.sd_send_loras}
              onChange={handleFieldChange}
              helpText={t('sdSendLorasHelp', 'Provides the list of installed LoRAs and their trigger words to the LLM during the initial generation loop so it can use <lora:name:weight> tags.')}
            />

            {formData.sd_use_tool && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300">
                    {t('sdToolDescription', 'Image Generation Tool Description (Prompt for LLM)')}
                  </label>
                  <button
                    type="button"
                    onClick={() => handleFieldChange("sd_tool_description", DEFAULT_SD_TOOL_DESCRIPTION)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                  >
                    {t('resetToDefault', 'Reset to Default')}
                  </button>
                </div>
                <textarea
                  value={formData.sd_tool_description !== undefined ? formData.sd_tool_description : DEFAULT_SD_TOOL_DESCRIPTION}
                  onChange={(e) => handleFieldChange("sd_tool_description", e.target.value)}
                  placeholder={DEFAULT_SD_TOOL_DESCRIPTION}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none resize-y min-h-[80px]"
                  rows={3}
                />
                <p className="text-[11px] text-gray-400">
                  {t('sdToolDescriptionHelp', 'Instructions provided to the LLM defining when and how to call the generate_image function.')}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <SelectField
              label={t('provider', 'Provider')}
              value={formData.sd_provider}
              onChange={(v: string) => handleFieldChange("sd_provider", v)}
              options={SD_PROVIDERS}
            />

            {formData.sd_provider === "horde" && (
              <InputField
                label={t('hordeApiKey', 'AI Horde API Key')}
                field="sd_horde_api_key"
                value={formData.sd_horde_api_key}
                onChange={(v: string) => handleFieldChange("sd_horde_api_key", v)}
                placeholder="0000000000"
                type="password"
              />
            )}

            {formData.sd_provider === "auto" && (
              <div className="space-y-2">
                <InputField
                  label={t('a1111Url', 'A1111 WebUI URL')}
                  field="sd_auto_url"
                  value={formData.sd_auto_url}
                  onChange={(v: string) => handleFieldChange("sd_auto_url", v)}
                  placeholder="http://127.0.0.1:7860"
                  type="text"
                />
                <InputField
                  label={t('a1111Auth', 'A1111 Basic Auth (Optional)')}
                  field="sd_auto_auth"
                  value={formData.sd_auto_auth}
                  onChange={(v: string) => handleFieldChange("sd_auto_auth", v)}
                  placeholder="username:password"
                  type="password"
                />
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-gray-400">
                    {t('a1111ApiHint', 'Ensure you start your A1111 WebUI with the --api commandline argument.')}
                  </p>
                  <button
                    onClick={() => handleFetchA1111Data(false)}
                    disabled={fetchingModels}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded text-xs transition flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={fetchingModels ? "animate-spin" : ""} />
                    {t('refreshData', 'Refresh Data')}
                  </button>
                </div>
              </div>
            )}

            {formData.sd_provider === "swarm" && (
              <div className="space-y-2">
                <InputField
                  label={t('swarmUrl', 'SwarmUI URL')}
                  field="sd_swarm_url"
                  value={formData.sd_swarm_url}
                  onChange={(v: string) => handleFieldChange("sd_swarm_url", v)}
                  placeholder="http://127.0.0.1:7801"
                  type="text"
                />
                <InputField
                  label={t('swarmAuthToken', 'SwarmUI Auth Token (Optional)')}
                  field="sd_swarm_auth_token"
                  value={formData.sd_swarm_auth_token}
                  onChange={(v: string) => handleFieldChange("sd_swarm_auth_token", v)}
                  placeholder="Swarm Auth Token"
                  type="password"
                />
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-gray-400">
                    {t('swarmApiHint', 'Default SwarmUI address is http://127.0.0.1:7801')}
                  </p>
                  <button
                    onClick={() => handleFetchSwarmData(false)}
                    disabled={fetchingModels}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded text-xs transition flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={fetchingModels ? "animate-spin" : ""} />
                    {t('refreshData', 'Refresh Data')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 pt-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                {formData.sd_provider === "horde" ? (
                  <SelectField
                    label={t('model', 'Model')}
                    value={formData.sd_model}
                    onChange={(v: string) => handleFieldChange("sd_model", v)}
                    options={availableModels.length > 1 ? availableModels : [{ value: formData.sd_model, label: formData.sd_model || "stable_diffusion" }]}
                  />
                ) : formData.sd_provider === "swarm" ? (
                  <SelectField
                    label={t('model', 'Model')}
                    value={formData.sd_model}
                    onChange={(v: string) => handleFieldChange("sd_model", v)}
                    options={swarmModels.length > 0 ? swarmModels : [{ value: formData.sd_model, label: formData.sd_model || "Select a model" }]}
                  />
                ) : (
                  <SelectField
                    label={t('model', 'Model')}
                    value={formData.sd_model}
                    onChange={(v: string) => handleFieldChange("sd_model", v)}
                    options={availableModels.length > 0 ? availableModels : [{ value: formData.sd_model, label: formData.sd_model || "Select a model" }]}
                  />
                )}
              </div>
              {formData.sd_provider === "horde" && (
                <button
                  onClick={() => handleFetchHordeModels(false)}
                  disabled={fetchingModels}
                  className="mb-1.5 px-4 py-2.5 bg-gray-900/60 hover:bg-gray-800 border border-gray-700 rounded-xl text-white text-sm transition flex items-center gap-2 disabled:opacity-50"
                  title="Fetch available models from AI Horde"
                >
                  <RefreshCw size={14} className={fetchingModels ? "animate-spin" : ""} />
                  {t('fetch', 'Fetch')}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            {formData.sd_provider === "auto" ? (
              <SelectField
                label={t('sampler', 'Sampler')}
                value={formData.sd_sampler}
                onChange={(v: string) => handleFieldChange("sd_sampler", v)}
                options={a1111Samplers.length > 0 ? a1111Samplers : [{ value: formData.sd_sampler || "Euler a", label: formData.sd_sampler || "Euler a" }]}
              />
            ) : formData.sd_provider === "swarm" ? (
              <SelectField
                label={t('sampler', 'Sampler')}
                value={formData.sd_sampler}
                onChange={(v: string) => handleFieldChange("sd_sampler", v)}
                options={swarmSamplers.length > 0 ? swarmSamplers : SD_SAMPLERS}
              />
            ) : (
              <SelectField
                label={t('sampler', 'Sampler')}
                value={formData.sd_sampler}
                onChange={(v: string) => handleFieldChange("sd_sampler", v)}
                options={SD_SAMPLERS}
              />
            )}
            <InputField
              label={t('seed', 'Seed (Optional)')}
              field="sd_seed"
              value={formData.sd_seed}
              onChange={(v: string) => handleFieldChange("sd_seed", v)}
              placeholder="Leave empty for random"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <Slider
              label={t('width', 'Width')}
              field="sd_width"
              value={formData.sd_width || 512}
              min={64}
              max={2048}
              step={64}
              onChange={handleFieldChange}
            />
            <Slider
              label={t('height', 'Height')}
              field="sd_height"
              value={formData.sd_height || 512}
              min={64}
              max={2048}
              step={64}
              onChange={handleFieldChange}
            />
            <Slider
              label={t('steps', 'Steps')}
              field="sd_steps"
              value={formData.sd_steps || 20}
              min={1}
              max={150}
              step={1}
              onChange={handleFieldChange}
            />
            <Slider
              label={t('cfgScale', 'CFG Scale')}
              field="sd_cfg_scale"
              value={formData.sd_cfg_scale || 7.0}
              min={1.0}
              max={30.0}
              step={0.5}
              onChange={handleFieldChange}
            />
          </div>

          {(formData.sd_provider === "horde" || formData.sd_provider === "swarm") && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4 border-t border-white/5">
              {formData.sd_provider === "horde" && (
                <Toggle
                  label={t('allowNsfw', 'Allow NSFW')}
                  field="sd_allow_nsfw"
                  value={formData.sd_allow_nsfw}
                  onChange={handleFieldChange}
                />
              )}
              <Toggle
                label={t('sanitizePrompts', 'Sanitize Prompts')}
                field="sd_sanitize_prompts"
                value={formData.sd_sanitize_prompts}
                onChange={handleFieldChange}
              />
              {formData.sd_provider === "horde" && (
                <Toggle
                  label={t('karras', 'Karras')}
                  field="sd_karras"
                  value={formData.sd_karras}
                  onChange={handleFieldChange}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <Toggle
              label={t('restoreFaces', 'Restore Faces')}
              field="sd_restore_faces"
              value={formData.sd_restore_faces}
              onChange={handleFieldChange}
            />
            <Toggle
              label={t('hiresFix', 'Hires. Fix')}
              field="sd_hires_fix"
              value={formData.sd_hires_fix}
              onChange={handleFieldChange}
            />
          </div>

          {formData.sd_provider === "auto" && (
            <div className="pt-4 border-t border-white/5 space-y-6">
              <h4 className="text-sm font-semibold text-white/80">{t('a1111AdvancedSettings', 'Advanced A1111 Settings')}</h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <SelectField
                  label={t('vae', 'VAE')}
                  value={formData.sd_auto_vae}
                  onChange={(v: string) => handleFieldChange("sd_auto_vae", v)}
                  options={a1111Vaes.length > 0 ? a1111Vaes : [{ value: formData.sd_auto_vae || "Automatic", label: formData.sd_auto_vae || "Automatic" }]}
                />
                <SelectField
                  label={t('scheduler', 'Scheduler')}
                  value={formData.sd_auto_scheduler}
                  onChange={(v: string) => handleFieldChange("sd_auto_scheduler", v)}
                  options={a1111Schedulers.length > 0 ? a1111Schedulers : [{ value: formData.sd_auto_scheduler || "Automatic", label: formData.sd_auto_scheduler || "Automatic" }]}
                />
                <SelectField
                  label={t('upscaler', 'Upscaler')}
                  value={formData.sd_auto_upscaler}
                  onChange={(v: string) => handleFieldChange("sd_auto_upscaler", v)}
                  options={a1111Upscalers.length > 0 ? a1111Upscalers : [{ value: formData.sd_auto_upscaler || "Latent", label: formData.sd_auto_upscaler || "Latent" }]}
                />
                <InputField
                  label={t('hiresSteps', 'Hires Steps (0 = same as base)')}
                  field="sd_auto_hires_steps"
                  value={formData.sd_auto_hires_steps?.toString() || "0"}
                  onChange={(v: string) => handleFieldChange("sd_auto_hires_steps", parseInt(v) || 0)}
                  placeholder="0"
                  type="number"
                />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Slider
                  label={t('clipSkip', 'Clip Skip')}
                  field="sd_auto_clip_skip"
                  value={formData.sd_auto_clip_skip || 1}
                  min={1}
                  max={12}
                  step={1}
                  onChange={handleFieldChange}
                />
                <Slider
                  label={t('denoisingStrength', 'Denoising Strength')}
                  field="sd_auto_denoising"
                  value={formData.sd_auto_denoising || 0.7}
                  min={0.0}
                  max={1.0}
                  step={0.01}
                  onChange={handleFieldChange}
                />
                <Slider
                  label={t('upscaleBy', 'Upscale By (Hires Fix)')}
                  field="sd_auto_upscale_by"
                  value={formData.sd_auto_upscale_by || 2.0}
                  min={1.0}
                  max={4.0}
                  step={0.05}
                  onChange={handleFieldChange}
                />
              </div>
            </div>
          )}

          {formData.sd_provider === "swarm" && formData.sd_hires_fix && (
            <div className="pt-4 border-t border-white/5 space-y-6">
              <h4 className="text-sm font-semibold text-white/80">{t('swarmRefinerSettings', 'SwarmUI Refiner & Upscale Settings')}</h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <SelectField
                  label={t('refinerModel', 'Refiner Model')}
                  value={formData.sd_swarm_refiner_model}
                  onChange={(v: string) => handleFieldChange("sd_swarm_refiner_model", v)}
                  options={[
                    { value: "", label: t('sameAsBaseModel', 'Same as Base Model') },
                    ...swarmModels
                  ]}
                />
                <SelectField
                  label={t('upscaleMethod', 'Upscale Method')}
                  value={formData.sd_swarm_refiner_method}
                  onChange={(v: string) => handleFieldChange("sd_swarm_refiner_method", v)}
                  options={[
                    { value: "pixel", label: "Pixel (Upscaler Model)" },
                    { value: "latent", label: "Latent" },
                    { value: "bilinear", label: "Bilinear" },
                    { value: "bicubic", label: "Bicubic" },
                    { value: "nearest-exact", label: "Nearest-Exact" },
                  ]}
                />
                <InputField
                  label={t('hiresSteps', 'Hires Steps (0 = default)')}
                  field="sd_swarm_refiner_steps"
                  value={formData.sd_swarm_refiner_steps?.toString() || "0"}
                  onChange={(v: string) => handleFieldChange("sd_swarm_refiner_steps", parseInt(v) || 0)}
                  placeholder="0"
                  type="number"
                />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Slider
                  label={t('upscaleScale', 'Upscale Scale')}
                  field="sd_swarm_refiner_upscale_size"
                  value={formData.sd_swarm_refiner_upscale_size || 2.0}
                  min={1.0}
                  max={4.0}
                  step={0.05}
                  onChange={handleFieldChange}
                />
                <Slider
                  label={t('refinerControlPercent', 'Refiner Control % (Step Switch)')}
                  field="sd_swarm_refiner_control_percent"
                  value={formData.sd_swarm_refiner_control_percent || 0.8}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  onChange={handleFieldChange}
                  helpText={t('refinerControlHelp', 'Point where refiner/upscaler takes over (e.g. 0.8 = at 80% progress)')}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewPresetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <h4 className="text-base font-semibold text-white">{t('newImagePresetTitle', 'New Image Preset')}</h4>
            <p className="text-xs text-gray-400">
              {t('newImagePresetDesc', 'Enter a name for the new image preset. It will copy all current settings.')}
            </p>
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g. SDXL Anime, Realistic Flux"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewPreset();
                if (e.key === "Escape") setShowNewPresetModal(false);
              }}
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewPresetModal(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-medium transition"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateNewPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
              >
                {t('create', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
