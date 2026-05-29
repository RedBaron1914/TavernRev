import { Globe } from "lucide-react";
import { Preset, Slider, Toggle } from "./shared";
import LorebookEditor from "../LorebookEditor";
import { useTranslation } from 'react-i18next'

interface WorldInfoTabProps {
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
  chatId: number | null;
  characterId: number | null;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
  compact?: boolean;
  showLorebooks?: boolean;
}

export function WorldInfoTab({
  formData,
  handleFieldChange,
  chatId,
  characterId,
  addToast,
  compact = false,
  showLorebooks = true,
}: WorldInfoTabProps) {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col gap-4">
      <div className="bg-gray-900/50 p-4 rounded-2xl border border-white/10 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-cyan-400 font-bold text-xs uppercase tracking-wider">
          <Globe size={16} /> {t('engineSettingsActivePreset', 'Engine Settings (Active Preset)')}
        </div>
        <div className="grid grid-cols-1 gap-6 mb-4">
          <Slider
            label={t('scanDepthWi_scan_depthMsgs', 'Scan Depth ({{wi_scan_depth}} msgs)', { wi_scan_depth: formData.wi_scan_depth })}
            field="wi_scan_depth"
            value={formData.wi_scan_depth}
            min={0}
            max={20}
            step={1}
            onChange={handleFieldChange}
            helpText={t('howManyRecent', 'How many recent messages to scan.')}
          />
          <Slider
            label={t('fixedBudgetVal', 'Fixed Budget ({{val}})', { val: formData.wi_token_budget === 0 ? "Off" : formData.wi_token_budget })}
            field="wi_token_budget"
            value={formData.wi_token_budget}
            min={0}
            max={4096}
            step={64}
            onChange={handleFieldChange}
            helpText={t('maxTokensOverrides', 'Max tokens (overrides % if > 0).')}
          />
          <Slider
            label={t('contextBudgetWi_context_percent', 'Context Budget ({{wi_context_percent}}%)', { wi_context_percent: formData.wi_context_percent })}
            field="wi_context_percent"
            value={formData.wi_context_percent}
            min={0}
            max={100}
            step={5}
            onChange={handleFieldChange}
            helpText={t('percentOfContext', '% of Context Size (used if Fixed is 0).')}
          />
        </div>
        {formData.wi_recursive && (
          <div className="mb-4">
            <Slider
              label={t('maxRecursionStepsWi_max_recursion', 'Max Recursion Steps ({{wi_max_recursion}})', { wi_max_recursion: formData.wi_max_recursion })}
              field="wi_max_recursion"
              value={formData.wi_max_recursion}
              min={1}
              max={10}
              step={1}
              onChange={handleFieldChange}
              helpText={t('maxDepthOfKeyword', 'Max depth of keyword scanning loop.')}
            />
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <Toggle
            label="Recursive"
            field="wi_recursive"
            value={formData.wi_recursive}
            onChange={handleFieldChange}
          />
          <Toggle
            label={t('caseSensitive', 'Case Sensitive')}
            field="wi_case_sensitive"
            value={formData.wi_case_sensitive}
            onChange={handleFieldChange}
          />
          <Toggle
            label={t('wholeWords', 'Whole Words')}
            field="wi_match_whole_words"
            value={formData.wi_match_whole_words}
            onChange={handleFieldChange}
          />
          <Toggle
            label={t('includeNames', 'Include Names')}
            field="wi_include_names"
            value={formData.wi_include_names}
            onChange={handleFieldChange}
          />

          <div className={`flex flex-col gap-2 ${compact ? "col-span-1" : "col-span-1 md:col-span-2 lg:col-span-2"}`}>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t('insertionStrategy', 'Insertion Strategy')}
            </label>
            <select
              value={formData.wi_insertion_strategy}
              onChange={(e) =>
                handleFieldChange("wi_insertion_strategy", e.target.value)
              }
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="char_first">
                {t('characterFirstCharGtChatGtGlobal', 'Character First (Char &gt; Chat &gt; Global)')}
              </option>
              <option value="global_first">
                {t('globalFirstGlobalGtChatGtChar', 'Global First (Global &gt; Chat &gt; Char)')}
              </option>
              <option value="priority">{t('evenlyByPriorityOnly', 'Evenly (By Priority Only)')}</option>
            </select>
          </div>
        </div>
      </div>
      {showLorebooks && (
        <div className="flex-1 min-h-0">
          <LorebookEditor
            chatId={chatId}
            characterId={characterId}
            addToast={addToast}
          />
        </div>
      )}
    </div>
  );
}
