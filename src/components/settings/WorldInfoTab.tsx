import { Globe } from "lucide-react";
import { Preset, Slider, Toggle } from "./shared";
import LorebookEditor from "../LorebookEditor";

interface WorldInfoTabProps {
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
  chatId: number | null;
  characterId: number | null;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
  compact?: boolean;
}

export function WorldInfoTab({
  formData,
  handleFieldChange,
  chatId,
  characterId,
  addToast,
  compact = false,
}: WorldInfoTabProps) {
  return (
    <div className="h-full flex flex-col gap-4">
      <div className="bg-gray-900/50 p-4 rounded-2xl border border-white/10 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-cyan-400 font-bold text-xs uppercase tracking-wider">
          <Globe size={16} /> Engine Settings (Active Preset)
        </div>
        <div className="grid grid-cols-1 gap-6 mb-4">
          <Slider
            label={`Scan Depth (${formData.wi_scan_depth} msgs)`}
            field="wi_scan_depth"
            value={formData.wi_scan_depth}
            min={0}
            max={20}
            step={1}
            onChange={handleFieldChange}
            helpText="How many recent messages to scan."
          />
          <Slider
            label={`Fixed Budget (${
              formData.wi_token_budget === 0 ? "Off" : formData.wi_token_budget
            })`}
            field="wi_token_budget"
            value={formData.wi_token_budget}
            min={0}
            max={4096}
            step={64}
            onChange={handleFieldChange}
            helpText="Max tokens (overrides % if > 0)."
          />
          <Slider
            label={`Context Budget (${formData.wi_context_percent}%)`}
            field="wi_context_percent"
            value={formData.wi_context_percent}
            min={0}
            max={100}
            step={5}
            onChange={handleFieldChange}
            helpText="% of Context Size (used if Fixed is 0)."
          />
        </div>
        {formData.wi_recursive && (
          <div className="mb-4">
            <Slider
              label={`Max Recursion Steps (${formData.wi_max_recursion})`}
              field="wi_max_recursion"
              value={formData.wi_max_recursion}
              min={1}
              max={10}
              step={1}
              onChange={handleFieldChange}
              helpText="Max depth of keyword scanning loop."
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
            label="Case Sensitive"
            field="wi_case_sensitive"
            value={formData.wi_case_sensitive}
            onChange={handleFieldChange}
          />
          <Toggle
            label="Whole Words"
            field="wi_match_whole_words"
            value={formData.wi_match_whole_words}
            onChange={handleFieldChange}
          />
          <Toggle
            label="Include Names"
            field="wi_include_names"
            value={formData.wi_include_names}
            onChange={handleFieldChange}
          />

          <div className={`flex flex-col gap-2 ${compact ? "col-span-1" : "col-span-1 md:col-span-2 lg:col-span-2"}`}>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Insertion Strategy
            </label>
            <select
              value={formData.wi_insertion_strategy}
              onChange={(e) =>
                handleFieldChange("wi_insertion_strategy", e.target.value)
              }
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="char_first">
                Character First (Char &gt; Chat &gt; Global)
              </option>
              <option value="global_first">
                Global First (Global &gt; Chat &gt; Char)
              </option>
              <option value="priority">Evenly (By Priority Only)</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <LorebookEditor
          chatId={chatId}
          characterId={characterId}
          addToast={addToast}
        />
      </div>
    </div>
  );
}
