import { useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateCheckerProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

export function UpdateChecker({ addToast }: UpdateCheckerProps) {
  const { t } = useTranslation("common");
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [downloadedLength, setDownloadedLength] = useState(0);
  const [contentLength, setContentLength] = useState(0);

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      const update = await check();
      
      if (update) {
        setUpdateAvailable(update);
        addToast(t("updateFound", "Update {{version}} is available!", { version: update.version }), "info");
      } else {
        addToast(t("noUpdates", "You are on the latest version."), "success");
      }
    } catch (e: any) {
      console.error("Update check failed", e);
      addToast(t("updateCheckFailed", "Failed to check for updates: ") + e.toString(), "error");
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!updateAvailable) return;
    
    try {
      setIsDownloading(true);
      setDownloadedLength(0);
      setContentLength(0);

      await updateAvailable.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setContentLength(event.data.contentLength || 0);
            break;
          case 'Progress':
            setDownloadedLength((prev) => prev + event.data.chunkLength);
            break;
          case 'Finished':
            break;
        }
      });

      addToast(t("updateInstalled", "Update installed! Restarting..."), "success");
      await relaunch();
    } catch (e: any) {
      console.error("Install failed", e);
      addToast(t("updateInstallFailed", "Failed to install update: ") + e.toString(), "error");
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
      <h3 className="text-lg font-bold text-white">{t("appUpdates", "App Updates")}</h3>
      <p className="text-gray-400 text-sm">
        {t("checkForUpdatesDesc", "Check for new versions of TavernRev and install them automatically.")}
      </p>

      {!updateAvailable ? (
        <button
          onClick={checkForUpdates}
          disabled={isChecking}
          className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white p-4 rounded-xl flex items-center justify-between group transition border border-white/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
              <RefreshCw size={20} className={isChecking ? "animate-spin" : ""} />
            </div>
            <div className="text-left">
              <div className="font-bold">{t("checkForUpdates", "Check for Updates")}</div>
              <div className="text-xs text-gray-500">
                {isChecking ? t("checking", "Checking...") : t("checkLatestRelease", "Fetch latest release from GitHub")}
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-indigo-400" />
            <div>
              <div className="font-bold text-white">{t("newVersionAvailable", "New version available!")}</div>
              <div className="text-sm text-indigo-300">
                v{updateAvailable.version} {updateAvailable.date && `(${new Date(updateAvailable.date).toLocaleDateString()})`}
              </div>
            </div>
          </div>
          
          {updateAvailable.body && (
            <div className="text-xs text-gray-400 bg-black/30 p-3 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
              {updateAvailable.body}
            </div>
          )}

          {!isDownloading ? (
            <div className="flex gap-2">
                <button
                onClick={installUpdate}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                <Download size={16} />
                {t("downloadAndInstall", "Download & Install")}
                </button>
                <button
                onClick={() => setUpdateAvailable(null)}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                {t("cancel", "Cancel")}
                </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-indigo-300">
                <span>{t("downloading", "Downloading...")}</span>
                {contentLength > 0 && (
                  <span>{Math.round((downloadedLength / contentLength) * 100)}%</span>
                )}
              </div>
              <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: contentLength > 0 ? `${(downloadedLength / contentLength) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
