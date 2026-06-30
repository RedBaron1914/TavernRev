import React, { useState } from "react";
import { Preset, SD_PROVIDERS, SD_SAMPLERS, SelectField, InputField, Slider, Toggle } from "./shared";
import { useTranslation } from 'react-i18next';
import { RefreshCw, Image } from "lucide-react";
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
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<{value: string, label: string}[]>([{ value: "stable_diffusion", label: "stable_diffusion" }]);
  const [a1111Samplers, setA1111Samplers] = useState<{value: string, label: string}[]>([]);
  const [a1111Vaes, setA1111Vaes] = useState<{value: string, label: string}[]>([]);
  const [a1111Upscalers, setA1111Upscalers] = useState<{value: string, label: string}[]>([]);
  const [a1111Schedulers, setA1111Schedulers] = useState<{value: string, label: string}[]>([]);

  type HordeModelInfo = {
    name: string;
    count: number;
    queued: number;
    eta: number;
  };

  const handleFetchHordeModels = async () => {
    try {
      setFetchingModels(true);
      const models = await invoke<HordeModelInfo[]>("get_horde_models");
      if (models && models.length > 0) {
        setAvailableModels([
          { value: "", label: t('anyModel', 'Any Model') },
          ...models.map(m => ({ 
            value: m.name, 
            label: `${m.name} (W: ${Math.round(m.count)}, Q: ${Math.round(m.queued)}, ETA: ${Math.round(m.eta)}s)` 
          }))
        ]);
        addToast(`Fetched ${models.length} models`, "success");
      }
    } catch (e: any) {
      addToast(`Failed to fetch models: ${e}`, "error");
    } finally {
      setFetchingModels(false);
    }
  };

  type A1111ModelInfo = {
    title: string;
    model_name: string;
  };

  const handleFetchA1111Data = async () => {
    if (!formData.sd_auto_url) {
      addToast("Please enter A1111 URL first", "error");
      return;
    }
    try {
      setFetchingModels(true);
      const url = formData.sd_auto_url;
      const auth = formData.sd_auto_auth || "";
      
      const [models, samplers, vaes, upscalers, schedulers] = await Promise.all([
        invoke<A1111ModelInfo[]>("get_a1111_models", { url, auth }),
        invoke<A1111ModelInfo[]>("get_a1111_samplers", { url, auth }),
        invoke<A1111ModelInfo[]>("get_a1111_vaes", { url, auth }),
        invoke<A1111ModelInfo[]>("get_a1111_upscalers", { url, auth }),
        invoke<A1111ModelInfo[]>("get_a1111_schedulers", { url, auth })
      ]);

      if (models.length) setAvailableModels(models.map(m => ({ value: m.title, label: m.model_name })));
      if (samplers.length) setA1111Samplers(samplers.map(m => ({ value: m.title, label: m.model_name })));
      if (vaes.length) setA1111Vaes(vaes.map(m => ({ value: m.title, label: m.model_name })));
      if (upscalers.length) setA1111Upscalers(upscalers.map(m => ({ value: m.title, label: m.model_name })));
      if (schedulers.length) setA1111Schedulers(schedulers.map(m => ({ value: m.title, label: m.model_name })));

      addToast("Fetched A1111 data successfully", "success");
    } catch (e: any) {
      addToast(`Failed to fetch A1111 data: ${e}`, "error");
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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

          <div className="grid grid-cols-1 gap-6">
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
                    onClick={handleFetchA1111Data}
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
                ) : (
                  <SelectField
                    label={t('model', 'Model')}
                    value={formData.sd_model}
                    onChange={(v: string) => handleFieldChange("sd_model", v)}
                    options={availableModels.length > 1 ? availableModels : [{ value: formData.sd_model, label: formData.sd_model || "Select a model" }]}
                  />
                )}
              </div>
              {formData.sd_provider === "horde" && (
                <button
                  onClick={handleFetchHordeModels}
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <Toggle
              label={t('allowNsfw', 'Allow NSFW')}
              field="sd_allow_nsfw"
              value={formData.sd_allow_nsfw}
              onChange={handleFieldChange}
            />
            <Toggle
              label={t('sanitizePrompts', 'Sanitize Prompts')}
              field="sd_sanitize_prompts"
              value={formData.sd_sanitize_prompts}
              onChange={handleFieldChange}
            />
            <Toggle
              label={t('restoreFaces', 'Restore Faces')}
              field="sd_restore_faces"
              value={formData.sd_restore_faces}
              onChange={handleFieldChange}
            />
            <Toggle
              label={t('karras', 'Karras')}
              field="sd_karras"
              value={formData.sd_karras}
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
        </div>
      </div>
    </div>
  );
};
