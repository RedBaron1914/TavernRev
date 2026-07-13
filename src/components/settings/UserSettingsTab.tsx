import { SlidersHorizontal, MessageSquare, FileText, Globe, Upload, Languages } from "lucide-react";
import { MacroTester, Slider } from "./shared";
import { useTranslation } from 'react-i18next'
import { AVAILABLE_LANGUAGES } from "../../i18n";

interface UserSettingsTabProps {
  uiSettings: { msgLimit: number; contentScale: number };
  handleUiChange: (field: string, value: number) => void;
  chatStyle: "bubbles" | "document";
  setChatStyle: (style: "bubbles" | "document") => void;
  characterId: number | null;
  bgMode: "default" | "custom" | "character";
  setBgMode: (m: "default" | "custom" | "character") => void;
  setCustomBg: (url: string) => void;
}

export function UserSettingsTab({
  uiSettings,
  handleUiChange,
  chatStyle,
  setChatStyle,
  characterId,
  bgMode,
  setBgMode,
  setCustomBg,
}: UserSettingsTabProps) {
  const { t, i18n } = useTranslation()
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-lg font-bold text-gray-300 flex items-center gap-2">
          <Languages size={20} /> {t('language', 'Language')}
        </h3>
        <select
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
        >
          {AVAILABLE_LANGUAGES.map((lng) => (
            <option key={lng} value={lng}>
              {new Intl.DisplayNames([lng], { type: "language" }).of(lng) || lng}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-lg font-bold text-gray-300 flex items-center gap-2">
          <Globe size={20} /> {t('background', 'Background')}
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setBgMode("default")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
                bgMode === "default"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t('default', 'Default')}
            </button>
            <button
              onClick={() => setBgMode("character")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
                bgMode === "character"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t('characterCard', 'Character Card')}
            </button>
            <button
              onClick={() => setBgMode("custom")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
                bgMode === "custom"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t('customImage', 'Custom Image')}
            </button>
          </div>

          {bgMode === "custom" && (
            <div className="space-y-2 animate-in fade-in">
              <label className="block w-full cursor-pointer bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded-xl p-4 text-center transition group">
                <Upload className="mx-auto mb-2 text-white md:text-gray-500 md:group-hover:text-white transition" />
                <span className="text-sm text-gray-200 md:text-gray-400 md:group-hover:text-gray-200">
                  {t('clickToUploadBackground', 'Click to upload background')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result as string;
                        setCustomBg(res);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-6">
        <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2 mb-2">
          <SlidersHorizontal size={20} /> {t('uiConfiguration', 'UI Configuration')}
        </h3>
        <Slider
          label={t('messagesPerLoad', 'Messages per Load')}
          value={uiSettings.msgLimit}
          min={10}
          max={500}
          step={10}
          onChange={(_: any, v: any) => handleUiChange("msgLimit", Number(v))}
          helpText={t('howManyMessages', 'How many messages to load at once. Higher values might cause lag on some devices.')}
        />
        <Slider
          label={t('contentScale', 'Content Scale')}
          value={uiSettings.contentScale}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(_: any, v: any) => handleUiChange("contentScale", Number(v))}
          helpText={t('adjustTextSize', 'Adjust text size for better readability on mobile.')}
        />

        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {t('chatLayout', 'Chat Layout')}
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
              <MessageSquare size={14} /> {t('bubbles', 'Bubbles')}
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
              <FileText size={14} /> {t('document', 'Document')}
            </button>
          </div>
        </div>
      </div>

      <MacroTester characterId={characterId} />
    </div>
  );
}
