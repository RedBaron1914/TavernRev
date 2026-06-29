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
                  <InputField
                    label={t('model', 'Model')}
                    field="sd_model"
                    value={formData.sd_model}
                    onChange={(v: string) => handleFieldChange("sd_model", v)}
                    placeholder="stable_diffusion"
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
            <SelectField
              label={t('sampler', 'Sampler')}
              value={formData.sd_sampler}
              onChange={(v: string) => handleFieldChange("sd_sampler", v)}
              options={SD_SAMPLERS}
            />
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
        </div>
      </div>
    </div>
  );
};
