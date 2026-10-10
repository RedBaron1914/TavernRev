import { SlidersHorizontal, Plus, Trash2, Download, Save, Ban, Settings as SettingsIcon, Eye, Minimize2 } from "lucide-react";
import { InputField, Preset, REASONING_OPTIONS, SelectField, Slider, Toggle, DEFAULT_VISUAL_COMPRESSION } from "./shared";
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Mobile Preset Selector */}
      <div className={`${compact ? "space-y-4" : "md:hidden flex justify-between items-center"} bg-gray-900/30 p-4 rounded-2xl border border-white/5`}>
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <SlidersHorizontal size={20} /> {t('preset', 'Preset')}
          </h3>
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
            {t('configuration', 'Configuration')}
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
              title={t('newPreset', 'New Preset')}
            >
              <Plus size={20} />
          </button>
            <button
              onClick={handleDeletePreset}
              className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-red-400 hover:text-red-300 transition ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
              title={t('deletePreset', 'Delete Preset')}
            >
              <Trash2 size={20} />
          </button>
          <label
            className={`bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition cursor-pointer ${compact ? "h-11 w-full flex items-center justify-center" : "p-2"}`}
            title={t('importPreset', 'Import Preset')}
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
              title={t('saveexportPreset', 'Save/Export Preset')}
            >
              <Save size={20} />
          </button>
        </div>
      </div>

      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2 mb-6">
          <SlidersHorizontal size={20} /> {t('sampling', 'Sampling')}
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
            helpText={t('controlsRandomness', 'Controls randomness.')}
          />
          <Slider
            label={t('topP', 'Top P')}
            field="top_p"
            value={formData.top_p}
            min={0.0}
            max={1.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label={t('topK', 'Top K')}
            field="top_k"
            value={formData.top_k}
            min={0}
            max={200}
            step={1}
            onChange={handleFieldChange}
          />
          <Slider
            label={t('minP', 'Min P')}
            field="min_p"
            value={formData.min_p}
            min={0.0}
            max={1.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <div className="pt-2">
            <SelectField
              label={t('reasoningEffort', 'Reasoning Effort')}
              value={formData.reasoning_effort}
              onChange={(v: any) => handleFieldChange("reasoning_effort", v)}
              options={REASONING_OPTIONS}
            />
            {formData.reasoning_effort && formData.reasoning_effort !== 'none' && (
                <div className="mt-4">
                    <Toggle
                        label={t('showThoughts', 'Show Thoughts')}
                        field="show_thoughts"
                        value={formData.show_thoughts ?? true}
                        onChange={handleFieldChange}
                        helpText={t('displayAiReasoning', 'Display the AI\'s internal reasoning process (if available).')}
                    />
                </div>
            )}
          </div>
        </div>
      </div>

      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2 mb-6">
          <Ban size={20} /> {t('penalties', 'Penalties')}
        </h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6">
          <Slider
            label={t('repetitionPenalty', 'Repetition Penalty')}
            field="repetition_penalty"
            value={formData.repetition_penalty}
            min={-2.0}
            max={2.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label={t('presencePenalty', 'Presence Penalty')}
            field="presence_penalty"
            value={formData.presence_penalty}
            min={-2.0}
            max={2.0}
            step={0.01}
            onChange={handleFieldChange}
          />
          <Slider
            label={t('frequencyPenalty', 'Frequency Penalty')}
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
          <SettingsIcon size={20} /> {t('output', 'Output')}
        </h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6">
          <InputField
            label={t('maxTokens', 'Max Tokens')}
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
              label={t('streamResponse', 'Stream Response')}
              field="stream_openai"
              value={formData.stream_openai}
              onChange={handleFieldChange}
              helpText={t('receiveTokensAsTheyAreGenerated', 'Receive tokens as they are generated.')}
            />
            <div className="mt-4">
                <Toggle
                  label={t('sendInlineImages', 'Send Inline Images')}
                  field="request_images"
                  value={formData.request_images}
                  onChange={handleFieldChange}
                  helpText={t('includeImagesInThePrompt', 'Include images in the prompt (Vision models only).')}
                />
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Eye size={12} /> {t('visualIdentity', 'Visual Identity')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Toggle label={t('sendCharAvatar', 'Send Char Avatar')} field="send_char_avatar" value={formData.send_char_avatar} onChange={handleFieldChange} helpText={t('showCharactersAppearance', 'Show character\'s appearance to the model.')} />
                  {formData.send_char_avatar && (
                     <InputField label={t('charPrompt', 'Char Prompt')} field="char_avatar_prompt" value={formData.char_avatar_prompt} onChange={(v: any) => handleFieldChange("char_avatar_prompt", v)} />
                  )}
                </div>
                <div className="space-y-2">
                  <Toggle label={t('sendUserAvatar', 'Send User Avatar')} field="send_user_avatar" value={formData.send_user_avatar} onChange={handleFieldChange} helpText={t('showUsersAppearance', 'Show user\'s appearance (Persona) to the model.')} />
                  {formData.send_user_avatar && (
                     <InputField label={t('userPrompt', 'User Prompt')} field="user_avatar_prompt" value={formData.user_avatar_prompt} onChange={(v: any) => handleFieldChange("user_avatar_prompt", v)} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VISUAL CONTEXT COMPRESSION (pxpipe / VCC) */}
      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 ${compact ? "p-4" : "p-6"}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <Minimize2 size={20} /> {t('visualContextCompression', 'Visual Context Compression (pxpipe)')}
          </h3>
          <span className="text-[11px] px-2.5 py-1 rounded-full font-mono font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            60-75% Token Save
          </span>
        </div>

        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
          {t('vccDescription', 'Renders bulky context (character card, lorebooks, RAG memory, older dialogue) into dense PNG images. Reduces token bills by 60-75% on vision models (Claude, Gemini, GPT-4o) and bypasses textual input filters.')}
        </p>

        <div className="space-y-6">
          <Toggle
            label={t('enableVcc', 'Enable Visual Compression')}
            field="vcc_enabled"
            value={formData.visual_compression?.enabled ?? false}
            onChange={(_: any, val: boolean) => {
              const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
              handleFieldChange("visual_compression", { ...current, enabled: val });
            }}
            helpText={t('enableVccHelp', 'Convert long context into visual PNG blocks before sending to the model.')}
          />

          {formData.visual_compression?.enabled && (
            <div className="space-y-5 pt-4 border-t border-white/10 animate-in fade-in duration-300">
              {/* Profile Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-cyan-400" />
                  {t('vccProfile', 'Rendering Profile')}
                </label>
                <select
                  value={formData.visual_compression?.profile || "auto"}
                  onChange={(e) => {
                    const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                    handleFieldChange("visual_compression", { ...current, profile: e.target.value });
                  }}
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                >
                  <option value="auto">{t('vccProfileAuto', 'Auto (Adaptive by model name)')}</option>
                  <option value="claude_fable">{t('vccProfileClaude', 'Claude / Fable 5 (Spleen 5x8, 220 cols, 728px)')}</option>
                  <option value="gemini_flash">{t('vccProfileGemini', 'Google Gemini 3.6/3.7 Flash (High Contrast, 180 cols)')}</option>
                  <option value="openai_sol">{t('vccProfileOpenAI', 'OpenAI / Sol (JetBrains Mono 14px, 90 cols)')}</option>
                  <option value="custom">{t('vccProfileCustom', 'Custom Balanced Profile')}</option>
                </select>
                <p className="text-[11px] text-gray-500">
                  {t('vccProfileHelp', 'Auto automatically selects the optimal patch geometry for Claude, Gemini, or GPT.')}
                </p>
              </div>

              {/* Granular What to Compress Checkboxes */}
              <div className="bg-gray-950/40 p-4 rounded-xl border border-white/5 space-y-3">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  {t('whatToCompress', 'What to compress into images')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.visual_compression?.compress_system ?? true}
                      onChange={(e) => {
                        const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                        handleFieldChange("visual_compression", { ...current, compress_system: e.target.checked });
                      }}
                      className="rounded bg-gray-900 border-gray-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                    />
                    {t('compressSystem', 'System & Character Card')}
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.visual_compression?.compress_lorebook ?? true}
                      onChange={(e) => {
                        const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                        handleFieldChange("visual_compression", { ...current, compress_lorebook: e.target.checked });
                      }}
                      className="rounded bg-gray-900 border-gray-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                    />
                    {t('compressLorebook', 'Lorebook / World Info')}
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.visual_compression?.compress_memory ?? true}
                      onChange={(e) => {
                        const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                        handleFieldChange("visual_compression", { ...current, compress_memory: e.target.checked });
                      }}
                      className="rounded bg-gray-900 border-gray-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                    />
                    {t('compressMemory', 'Memory / RAG Context')}
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={formData.visual_compression?.compress_history ?? true}
                      onChange={(e) => {
                        const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                        handleFieldChange("visual_compression", { ...current, compress_history: e.target.checked });
                      }}
                      className="rounded bg-gray-900 border-gray-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                    />
                    {t('compressHistory', 'Older Chat Messages')}
                  </label>
                </div>
              </div>

              {/* Number controls: history_keep_tail & min_chars_threshold */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                  label={t('historyKeepTail', 'Recent turns to keep as raw text')}
                  type="number"
                  value={formData.visual_compression?.history_keep_tail ?? 4}
                  onChange={(val: any) => {
                    const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                    handleFieldChange("visual_compression", { ...current, history_keep_tail: Math.max(0, parseInt(val) || 0) });
                  }}
                  helpText={t('historyKeepTailHelp', 'Newest turns remain plain text for maximum verbatim accuracy.')}
                />

                <InputField
                  label={t('minCharsThreshold', 'Min character threshold')}
                  type="number"
                  value={formData.visual_compression?.min_chars_threshold ?? 1000}
                  onChange={(val: any) => {
                    const current = formData.visual_compression || DEFAULT_VISUAL_COMPRESSION;
                    handleFieldChange("visual_compression", { ...current, min_chars_threshold: Math.max(100, parseInt(val) || 1000) });
                  }}
                  helpText={t('minCharsThresholdHelp', 'Text blocks shorter than this will not be rendered into images.')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {renderPromptManager()}
    </div>
  );
}
