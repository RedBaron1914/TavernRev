import { LayoutTemplate, MessageSquare } from "lucide-react";
import { Preset, ConnectionProfile, Toggle, TextAreaField, InputField } from "../../Settings";

interface FormattingTabProps {
  connectionData: ConnectionProfile;
  formData: Preset;
  handleFieldChange: (field: keyof Preset, value: any) => void;
}

export function FormattingTab({
  connectionData,
  formData,
  handleFieldChange,
}: FormattingTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={`bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-6 ${
          connectionData.api_type === "chat_completion"
            ? "opacity-50 pointer-events-none grayscale"
            : ""
        }`}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
            <LayoutTemplate size={20} /> Instruct Mode
          </h3>
          {connectionData.api_type === "chat_completion" && (
            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded border border-yellow-500/20 font-bold">
              ONLY FOR TEXT COMPLETION
            </span>
          )}
        </div>

        <Toggle
          label="Enable Instruct Mode"
          field="instruct_mode_enabled"
          value={
            connectionData.api_type === "chat_completion"
              ? false
              : formData.instruct_mode_enabled
          }
          onChange={(f: any, v: any) =>
            connectionData.api_type !== "chat_completion" &&
            handleFieldChange(f, v)
          }
        />

        {/* Only show details if enabled AND not blocked */}
        {formData.instruct_mode_enabled &&
          connectionData.api_type !== "chat_completion" && (
            <div className="grid gap-5 pl-4 border-l-2 border-indigo-500/20">
              <TextAreaField
                label="Input Sequence (User)"
                value={formData.input_sequence}
                onChange={(v: any) => handleFieldChange("input_sequence", v)}
                rows={2}
              />
              <TextAreaField
                label="Output Sequence (AI)"
                value={formData.output_sequence}
                onChange={(v: any) => handleFieldChange("output_sequence", v)}
                rows={2}
              />
              <TextAreaField
                label="System Sequence"
                value={formData.system_sequence}
                onChange={(v: any) => handleFieldChange("system_sequence", v)}
                rows={2}
              />
            </div>
          )}
      </div>
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-5">
        <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
          <MessageSquare size={20} /> Utility Prompts
        </h3>
        <TextAreaField
          label="Impersonation Prompt"
          value={formData.impersonation_prompt}
          onChange={(v: any) => handleFieldChange("impersonation_prompt", v)}
          placeholder="e.g. Write as {{char}}..."
        />
        <TextAreaField
          label="Continue Nudge"
          value={formData.continue_nudge_prompt}
          onChange={(v: any) => handleFieldChange("continue_nudge_prompt", v)}
          placeholder="e.g. Continue..."
        />
        <div className="space-y-1">
          <TextAreaField
            label="First Message / Greeting Randomizer"
            value={formData.new_chat_prompt}
            onChange={(v: any) => handleFieldChange("new_chat_prompt", v)}
            placeholder="[Start a new roleplay...]"
          />
          <p className="text-[10px] text-gray-500 px-1">
            This prompt forces the AI to write a new, random greeting based on
            the scenario when starting a chat.
          </p>
        </div>
        <InputField
          label="Stop Strings (comma separated)"
          value={formData.stop_strings}
          onChange={(v: any) => handleFieldChange("stop_strings", v)}
        />
      </div>
    </div>
  );
}
