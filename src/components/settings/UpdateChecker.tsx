import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";
import { type as osType } from "@tauri-apps/plugin-os";

interface UpdateCheckerProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface AndroidUpdate {
  version: string;
  date: string;
  body: string;
  assets: GithubAsset[];
  isAndroid: true;
}

export function UpdateChecker({ addToast }: UpdateCheckerProps) {
  const { t } = useTranslation("common");
  const [isSupportedOs, setIsSupportedOs] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<Update | AndroidUpdate | null>(null);
  const [selectedApk, setSelectedApk] = useState<string>("");
  const [downloadedLength, setDownloadedLength] = useState(0);
  const [contentLength, setContentLength] = useState(0);

  useEffect(() => {
    const os = osType();
    setIsSupportedOs(["windows", "macos", "linux"].includes(os));
  }, []);

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      if (isSupportedOs === false) {
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        const response = await fetch("https://api.github.com/repos/RedBaron1914/TavernRev/releases/latest");
        if (!response.ok) throw new Error("Failed to fetch release");
        const data = await response.json();
        const latestVersion = data.tag_name.replace(/^v/, '');
        
        if (latestVersion !== currentVersion) {
            const apks = data.assets.filter((a: any) => a.name.endsWith('.apk'));
            if (apks.length > 0) {
                setUpdateAvailable({
                    version: latestVersion,
                    date: data.published_at,
                    body: data.body,
                    assets: apks,
                    isAndroid: true
                });
                const defApk = apks.find((a: any) => a.name.includes("universal")) || apks[0];
                setSelectedApk(defApk.browser_download_url);
                addToast(t("updateFound", "Update {{version}} is available!", { version: latestVersion }), "info");
            } else {
                addToast(t("noUpdates", "You are on the latest version."), "success");
            }
        } else {
            addToast(t("noUpdates", "You are on the latest version."), "success");
        }
      } else {
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
          addToast(t("updateFound", "Update {{version}} is available!", { version: update.version }), "info");
        } else {
          addToast(t("noUpdates", "You are on the latest version."), "success");
        }
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

      if ("isAndroid" in updateAvailable) {
        const { invoke } = await import("@tauri-apps/api/core");
        addToast(t("downloadingApk", "Downloading update... Please wait for the install prompt."), "info");
        await invoke("install_android_update", { url: selectedApk });
        setIsDownloading(false);
      } else {
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
      }
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

          {"isAndroid" in updateAvailable && updateAvailable.assets && (
            <div className="flex flex-col gap-2 bg-black/20 p-3 rounded-lg border border-white/5">
                <label className="text-xs font-bold text-gray-400">{t("selectApkToDownload", "Select APK to download:")}</label>
                <select 
                    value={selectedApk} 
                    onChange={(e) => setSelectedApk(e.target.value)}
                    className="bg-gray-800 text-white text-sm rounded border border-gray-700 px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                    disabled={isDownloading}
                >
                    {updateAvailable.assets.map((asset) => (
                        <option key={asset.name} value={asset.browser_download_url}>
                            {asset.name}
                        </option>
                    ))}
                </select>
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
                {!("isAndroid" in updateAvailable) && contentLength > 0 && (
                  <span>{Math.round((downloadedLength / contentLength) * 100)}%</span>
                )}
              </div>
              {!("isAndroid" in updateAvailable) ? (
                  <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: contentLength > 0 ? `${(downloadedLength / contentLength) * 100}%` : '0%' }}
                    />
                  </div>
              ) : (
                  <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden relative">
                     <div className="absolute top-0 bottom-0 left-0 right-0 bg-indigo-500 animate-pulse"></div>
                  </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
