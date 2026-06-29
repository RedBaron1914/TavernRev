import React from "react";
import { Preset } from "./shared";
import { InputField, Slider, Toggle } from "./shared";
import { useTranslation } from 'react-i18next';

type ImageGenerationTabProps = {
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
};

export const ImageGenerationTab: React.FC<ImageGenerationTabProps> = ({
  formData,
  handleFieldChange,
}) => {
  // @ts-expect-error - t is unused for now
  const { t } = useTranslation('common');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">AI Horde Image Generation</h3>
              <p className="text-sm text-gray-400">Settings for generating images via Stable Horde</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Toggle
              label="Use Tool Calling"
              field="sd_use_tool"
              value={formData.sd_use_tool}
              onChange={handleFieldChange}
              helpText="Allow the AI to automatically request images during chat."
            />
            <InputField
              label="AI Horde API Key"
              field="sd_horde_api_key"
              value={formData.sd_horde_api_key}
              onChange={(v: string) => handleFieldChange("sd_horde_api_key", v)}
              placeholder="0000000000"
              type="password"
            />
            <InputField
              label="Model (Optional)"
              field="sd_model"
              value={formData.sd_model}
              onChange={(v: string) => handleFieldChange("sd_model", v)}
              placeholder="stable_diffusion"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <Slider
              label="Width"
              field="sd_width"
              value={formData.sd_width || 512}
              min={64}
              max={2048}
              step={64}
              onChange={handleFieldChange}
            />
            <Slider
              label="Height"
              field="sd_height"
              value={formData.sd_height || 512}
              min={64}
              max={2048}
              step={64}
              onChange={handleFieldChange}
            />
            <Slider
              label="Steps"
              field="sd_steps"
              value={formData.sd_steps || 20}
              min={1}
              max={150}
              step={1}
              onChange={handleFieldChange}
            />
            <Slider
              label="CFG Scale"
              field="sd_cfg_scale"
              value={formData.sd_cfg_scale || 7.0}
              min={1.0}
              max={30.0}
              step={0.5}
              onChange={handleFieldChange}
            />
          </div>
          <div className="pt-2">
             <InputField
              label="Sampler"
              field="sd_sampler"
              value={formData.sd_sampler}
              onChange={(v: string) => handleFieldChange("sd_sampler", v)}
              placeholder="k_euler_a"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
