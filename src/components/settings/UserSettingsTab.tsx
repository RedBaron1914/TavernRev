import { SlidersHorizontal, MessageSquare, FileText } from "lucide-react";
import { MacroTester, Slider } from "./shared";

interface UserSettingsTabProps {
  uiSettings: { msgLimit: number; contentScale: number };
  handleUiChange: (field: string, value: number) => void;
  chatStyle: "bubbles" | "document";
  setChatStyle: (style: "bubbles" | "document") => void;
  characterId: number | null;
}

export function UserSettingsTab({
  uiSettings,
  handleUiChange,
  chatStyle,
  setChatStyle,
  characterId,
}: UserSettingsTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-6">
        <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2 mb-2">
          <SlidersHorizontal size={20} /> UI Configuration
        </h3>
        <Slider
          label="Messages per Load"
          value={uiSettings.msgLimit}
          min={10}
          max={500}
          step={10}
          onChange={(_: any, v: any) => handleUiChange("msgLimit", Number(v))}
          helpText="How many messages to load at once. Higher values might cause lag on some devices."
        />
        <Slider
          label="Content Scale"
          value={uiSettings.contentScale}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(_: any, v: any) => handleUiChange("contentScale", Number(v))}
          helpText="Adjust text size for better readability on mobile."
        />

        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Chat Layout
          </label>
          <div className="grid grid-cols-2 gap-2 bg-gray-950 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setChatStyle("bubbles");
                localStorage.setItem("ui_chat_style", "bubbles");
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                chatStyle !== "document"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <MessageSquare size={14} /> Bubbles
            </button>
            <button
              onClick={() => {
                setChatStyle("document");
                localStorage.setItem("ui_chat_style", "document");
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                chatStyle === "document"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <FileText size={14} /> Document
            </button>
          </div>
        </div>
      </div>

      <MacroTester characterId={characterId} />
    </div>
  );
}
