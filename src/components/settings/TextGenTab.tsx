import { SlidersHorizontal, Plus, Trash2, Download, Save, Ban, Settings as SettingsIcon, Eye } from "lucide-react";
import { InputField, Preset, REASONING_OPTIONS, SelectField, Slider, Toggle } from "./shared";

interface TextGenTabProps {
  activePresetFile: string | null;
  presetsList: string[];
  loadPresetData: (file: string) => void;
  handleCreatePreset: () => void;
  handleDeletePreset: () => void;
  handleImportPreset: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportPreset: () => void;
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
  renderPromptManager: () => React.ReactNode;
  compact?: boolean;
}

export function TextGenTab({
  activePresetFile,
  presetsList,
  loadPresetData,
  handleCreatePreset,
  handleDeletePreset,
  handleImportPreset,
  handleExportPreset,
  formData,
  handleFieldChange,
  renderPromptManager,
  compact = false,
}: TextGenTabProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Mobile Preset Selector */}
      <div className={`${compact ? "space-y-4" : "md:hidden flex justify-between items-center"} bg-gray-900/30 p-4 rounded-2xl border border-white/5`}>
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <SlidersHorizontal size={20} /> Preset
          </h3>
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            Configuration
          </span>
        </div>
        <div className={`${compact ? "grid grid-cols-4 gap-2" : "flex gap-2 items-center"}`}>
          <select
            value={activePresetFile || ""}
            onChange={(e) => loadPresetData(e.target.value)}
            className={`bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 ${compact ? "col-span-4 w-full" : "max-w-[150px]"}`}
          >
            {presetsList.map((f) => (
              <option key={f} value={f}>
                {f.replace(".json", "")}
              </option>
            ))}
          </select>
            <button
              onClick={handleCreatePreset}
              className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-emerald-400 hover:text-emerald-300 transition ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
              title="New Preset"
            >
              <Plus size={20} />
          </button>
            <button
              onClick={handleDeletePreset}
              className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-red-400 hover:text-red-300 transition ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
              title="Delete Preset"
            >
              <Trash2 size={20} />
          </button>
          <label
            className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition cursor-pointer ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
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
              className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
              title="Save/Export Preset"
            >
              <Save size={20} />
          </button>
        </div>
      </div>

      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2 mb-6">
          <SlidersHorizontal size={20} /> Sampling
        </h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6">
          <Slider
            label="Temperature"
            field="temperature"
            value={formData.temperature}
            min={0.1}
            max={5.0}
            step={0.01}
            onChange={handleFieldChange}
            helpText="Controls randomness."
          />
          <Slider
            label="Top P"
            field="top_p"
            value={formData.top_p}
            min={0.0}
            max={1.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label="Top K"
            field="top_k"
            value={formData.top_k}
            min={0}
            max={200}
            step={1}
            onChange={handleFieldChange}
          />
          <Slider
            label="Min P"
            field="min_p"
            value={formData.min_p}
            min={0.0}
            max={1.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <div className="pt-2">
            <SelectField
              label="Reasoning Effort"
              value={formData.reasoning_effort}
              onChange={(v: any) => handleFieldChange("reasoning_effort", v)}
              options={REASONING_OPTIONS}
            />
            {formData.reasoning_effort && formData.reasoning_effort !== 'none' && (
                <div className="mt-4">
                    <Toggle
                        label="Show Thoughts"
                        field="show_thoughts"
                        value={formData.show_thoughts ?? true}
                        onChange={handleFieldChange}
                        helpText="Display the AI's internal reasoning process (if available)."
                    />
                </div>
            )}
          </div>
        </div>
      </div>

      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2 mb-6">
          <Ban size={20} /> Penalties
        </h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6">
          <Slider
            label="Repetition Penalty"
            field="repetition_penalty"
            value={formData.repetition_penalty}
            min={-2.0}
            max={2.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label="Presence Penalty"
            field="presence_penalty"
            value={formData.presence_penalty}
            min={-2.0}
            max={2.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label="Frequency Penalty"
            field="frequency_penalty"
            value={formData.frequency_penalty}
            min={-2.0}
            max={2.0}
            step={0.01}
            onChange={handleFieldChange}
          />
        </div>
      </div>

      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2 mb-6">
          <SettingsIcon size={20} /> Output
        </h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6">
          <InputField
            label="Max Tokens"
            type="number"
            value={formData.openai_max_tokens}
            onChange={(v: any) =>
              handleFieldChange("openai_max_tokens", v)
            }
          />
          <InputField
            label="Seed"
            type="number"
            value={formData.seed}
            onChange={(v: any) =>
              handleFieldChange("seed", v)
            }
            placeholder="-1"
          />
          <div className="pt-2">
            <Toggle
              label="Stream Response"
              field="stream_openai"
              value={formData.stream_openai}
              onChange={handleFieldChange}
              helpText="Receive tokens as they are generated."
            />
            <div className="mt-4">
                <Toggle
                  label="Send Inline Images"
                  field="request_images"
                  value={formData.request_images}
                  onChange={handleFieldChange}
                  helpText="Include images in the prompt (Vision models only)."
                />
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Eye size={12} /> Visual Identity
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Toggle label="Send Char Avatar" field="send_char_avatar" value={formData.send_char_avatar} onChange={handleFieldChange} helpText="Show character's appearance to the model." />
                  {formData.send_char_avatar && (
                     <InputField label="Char Prompt" field="char_avatar_prompt" value={formData.char_avatar_prompt} onChange={(v: any) => handleFieldChange("char_avatar_prompt", v)} />
                  )}
                </div>
                <div className="space-y-2">
                  <Toggle label="Send User Avatar" field="send_user_avatar" value={formData.send_user_avatar} onChange={handleFieldChange} helpText="Show user's appearance (Persona) to the model." />
                  {formData.send_user_avatar && (
                     <InputField label="User Prompt" field="user_avatar_prompt" value={formData.user_avatar_prompt} onChange={(v: any) => handleFieldChange("user_avatar_prompt", v)} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PROMPT MANAGER INTEGRATED AT BOTTOM */}
      {renderPromptManager()}
    </div>
  );
}
