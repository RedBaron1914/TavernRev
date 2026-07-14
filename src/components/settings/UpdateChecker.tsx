import { useState } from "react";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type as osType } from "@tauri-apps/plugin-os";

interface UpdateCheckerProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface CustomUpdate {
  version: string;
  date: string;
  body: string;
  assets: GithubAsset[];
  isAndroid: boolean;
}

export function UpdateChecker({ addToast }: UpdateCheckerProps) {
  const { t } = useTranslation("common");
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<CustomUpdate | null>(null);
  const [selectedApk, setSelectedApk] = useState<string>("");
  const [downloadedLength, setDownloadedLength] = useState(0);
  const [contentLength, setContentLength] = useState(0);

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      const { getVersion } = await import("@tauri-apps/api/app");
      const currentVersion = await getVersion();
      const response = await fetch("https://api.github.com/repos/RedBaron1914/TavernRev/releases/latest", {
        headers: { "User-Agent": "TavernRev-Updater" }
      });
      if (!response.ok) throw new Error("Failed to fetch release");
      const data = await response.json();
      const latestVersion = data.tag_name.replace(/^v/, '');
      
      const compareVersions = (v1: string, v2: string) => {
        const parseSemVer = (v: string) => {
          const [base, pre] = v.split('-');
          const parts = base.split('.').map(Number);
          return { parts, pre: pre || '' };
        };
        const parsed1 = parseSemVer(v1);
        const parsed2 = parseSemVer(v2);
        
        for (let i = 0; i < Math.max(parsed1.parts.length, parsed2.parts.length); i++) {
          const num1 = parsed1.parts[i] || 0;
          const num2 = parsed2.parts[i] || 0;
          if (num1 > num2) return 1;
          if (num1 < num2) return -1;
        }
        if (parsed1.pre === '' && parsed2.pre !== '') return 1;
        if (parsed1.pre !== '' && parsed2.pre === '') return -1;
        if (parsed1.pre > parsed2.pre) return 1;
        if (parsed1.pre < parsed2.pre) return -1;
        return 0;
      };
      
      if (compareVersions(latestVersion, currentVersion) > 0) {
          let relevantAssets = [];
          let defaultAssetUrl = "";
          const os = osType();
          
          if (os === "android") {
              relevantAssets = data.assets.filter((a: any) => a.name.endsWith('.apk'));
              if (relevantAssets.length > 0) {
                  const def = relevantAssets.find((a: any) => a.name.includes("arm64-v8a")) 
                      || relevantAssets.find((a: any) => a.name.includes("universal")) 
                      || relevantAssets[0];
                  defaultAssetUrl = def.browser_download_url;
              }
          } else if (os === "windows") {
              relevantAssets = data.assets.filter((a: any) => a.name.endsWith('.msi') || a.name.endsWith('.exe'));
              if (relevantAssets.length > 0) {
                  const def = relevantAssets.find((a: any) => a.name.endsWith('.msi')) || relevantAssets[0];
                  defaultAssetUrl = def.browser_download_url;
              }
          } else if (os === "linux") {
              relevantAssets = data.assets.filter((a: any) => a.name.endsWith('.deb') || a.name.endsWith('.rpm') || a.name.endsWith('.AppImage'));
              if (relevantAssets.length > 0) {
                  const def = relevantAssets.find((a: any) => a.name.endsWith('.deb')) 
                      || relevantAssets.find((a: any) => a.name.endsWith('.rpm')) 
                      || relevantAssets[0];
                  defaultAssetUrl = def.browser_download_url;
              }
          } else {
              // MacOS fallback
              relevantAssets = data.assets.filter((a: any) => a.name.endsWith('.dmg') || a.name.endsWith('.app.tar.gz'));
              if (relevantAssets.length > 0) defaultAssetUrl = relevantAssets[0].browser_download_url;
          }
          
          if (relevantAssets.length > 0) {
              setUpdateAvailable({
                  version: latestVersion,
                  date: data.published_at,
                  body: data.body,
                  assets: relevantAssets,
                  isAndroid: os === "android"
              });
              setSelectedApk(defaultAssetUrl);
              addToast(t("updateFound", "Update {{version}} is available!", { version: latestVersion }), "info");
          } else {
              addToast(t("noUpdates", "You are on the latest version."), "success");
          }
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

      if (updateAvailable.isAndroid) {
        const { invoke } = await import("@tauri-apps/api/core");
        addToast(t("downloadingApk", "Downloading update... Please wait for the install prompt."), "info");
        await invoke("install_android_update", { url: selectedApk });
        setIsDownloading(false);
      } else {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(selectedApk);
        addToast(t("updateOpenedBrowser", "Update installer is downloading in your browser. Please run it!"), "success");
        setIsDownloading(false);
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

          {updateAvailable.assets && (
            <div className="bg-black/20 p-3 rounded-lg border border-white/5">
              <div className="text-gray-400 text-sm mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {updateAvailable.body}
              </div>
              
              <select
                value={selectedApk}
                onChange={(e) => setSelectedApk(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 text-white rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {updateAvailable.assets.map((asset: any) => (
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
