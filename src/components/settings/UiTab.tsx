import { Globe, Upload, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AVAILABLE_LANGUAGES } from "../../i18n";

interface UiTabProps {
  bgMode: "default" | "custom" | "character";
  setBgMode: (m: "default" | "custom" | "character") => void;
  setCustomBg: (url: string) => void;
}

export function UiTab({ bgMode, setBgMode, setCustomBg }: UiTabProps) {
  const { t, i18n } = useTranslation();

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
                <Upload className="mx-auto mb-2 text-gray-500 group-hover:text-white transition" />
                <span className="text-sm text-gray-400 group-hover:text-gray-200">
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
    </div>
  );
}
