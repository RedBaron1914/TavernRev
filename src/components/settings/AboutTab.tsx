import { useState, useEffect } from "react";
import {
  Info,
  Copy,
  Check,
  ExternalLink,
  Monitor,
  Cpu,
  Layers,
  HardDrive,
  Globe,
  Sparkles,
  MessageSquare,
  Github,
  Maximize,
  Smartphone
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type, version, arch, platform } from "@tauri-apps/plugin-os";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

interface AboutTabProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

const DISCORD_INVITE_URL = "https://discord.gg/K5524BnmMp"; // Discord community invite link
const GITHUB_REPO_URL = "https://github.com/RedBaron1914/TavernRev";
const APP_VERSION = "1.6.0";
const COMMIT_HASH = "f03cf30";

export function AboutTab({ addToast }: AboutTabProps) {
  const { t } = useTranslation("common");
  const [copied, setCopied] = useState(false);

  const [sysInfo, setSysInfo] = useState(() => {
    let osT = "Unknown";
    let osV = "Unknown";
    let osA = "Unknown";
    let osP = "Unknown";

    try {
      osT = type();
      osV = version();
      osA = arch();
      osP = platform();
    } catch {
      osT = navigator.platform || "Unknown";
    }

    // Fallback extraction from user agent for mobile device model
    let uaModel = "";
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad/i.test(ua);
    if (/Android/i.test(ua)) {
      const match = ua.match(/Android\s+([^;]+);\s+([^;)]+)/i);
      if (match && match[2]) {
        uaModel = match[2].trim().replace(/\s+Build\/.*/i, "");
      }
    } else if (/iPhone|iPad/i.test(ua)) {
      uaModel = /iPad/i.test(ua) ? "Apple iPad" : "Apple iPhone";
    }

    return {
      osType: osT,
      osVersion: osV,
      osArch: osA,
      osPlatform: osP,
      deviceModel: uaModel || (isMobile ? "Mobile Device" : "PC / Desktop"),
      deviceManufacturer: "",
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      colorDepth: window.screen.colorDepth || 24,
      cpuCores: navigator.hardwareConcurrency || "N/A",
      memory: (navigator as any).deviceMemory ? `~${(navigator as any).deviceMemory} GB` : "N/A",
      userAgent: ua,
      language: navigator.language || "en",
      isMobile,
    };
  });

  useEffect(() => {
    // Fetch hardware device info via native backend
    invoke<{ manufacturer?: string; model?: string; device?: string; os_version?: string }>("get_device_info")
      .then((info) => {
        if (info && (info.model || info.manufacturer)) {
          const parts = [info.manufacturer, info.model].filter(Boolean);
          const fullModel = parts.join(" ").trim();
          if (fullModel) {
            setSysInfo((prev) => ({
              ...prev,
              deviceModel: fullModel,
              deviceManufacturer: info.manufacturer || "",
              osVersion: info.os_version || prev.osVersion,
            }));
          }
        }
      })
      .catch((e) => console.warn("Failed to get native device info:", e));

    const handleResize = () => {
      setSysInfo((prev) => ({
        ...prev,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  const getDiagnosticsMarkdown = () => {
    const dpi = Math.round(sysInfo.pixelRatio * 96);
    return `### TavernRev System Diagnostics
- **App Version**: TavernRev v${APP_VERSION} (${COMMIT_HASH})
- **Device Model**: ${sysInfo.deviceModel} (${sysInfo.isMobile ? "Mobile" : "Desktop"})
- **OS / Platform**: ${sysInfo.osType} ${sysInfo.osVersion} (${sysInfo.osArch}) [Platform: ${sysInfo.osPlatform}]
- **Screen Resolution**: ${sysInfo.screenWidth} × ${sysInfo.screenHeight} (${sysInfo.colorDepth}-bit)
- **Viewport**: ${sysInfo.viewportWidth} × ${sysInfo.viewportHeight}
- **Scale / DPI**: ${sysInfo.pixelRatio}x (~${dpi} DPI)
- **Hardware**: ${sysInfo.cpuCores} Logical CPU Cores, Memory: ${sysInfo.memory}
- **Language / Locale**: ${sysInfo.language}
- **User Agent**: \`${sysInfo.userAgent}\`
`;
  };

  const handleCopyDiagnostics = () => {
    const text = getDiagnosticsMarkdown();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      addToast(t("diagnosticsCopiedToast", "System diagnostics copied to clipboard!"), "success");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const dpi = Math.round(sysInfo.pixelRatio * 96);

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* HEADER CARD */}
      <div className="relative overflow-hidden p-6 md:p-8 bg-gradient-to-br from-gray-900 via-indigo-950/40 to-gray-900 rounded-3xl border border-white/10 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>TavernRev</span>
                <Sparkles size={20} className="text-indigo-400" />
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                v{APP_VERSION}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-white/5 text-gray-400 border border-white/10 rounded-md">
                {COMMIT_HASH}
              </span>
            </div>
            <p className="text-xs md:text-sm text-gray-400 max-w-md">
              {t("aboutAppTagline", "Modern, extensible, high-performance desktop and mobile roleplay platform.")}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleCopyDiagnostics}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-bold text-gray-200 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              title={t("copyDiagnosticsTooltip", "Copy system specifications formatted for bug reporting")}
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-indigo-400" />}
              <span>{copied ? t("copied", "Copied!") : t("copyDiagnostics", "Copy Diagnostics")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* COMMUNITY & SUPPORT BANNERS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DISCORD CARD */}
        <div className="p-5 bg-gradient-to-br from-[#5865F2]/15 via-gray-900 to-gray-900 border border-[#5865F2]/30 rounded-2xl flex flex-col justify-between space-y-4 hover:border-[#5865F2]/50 transition group">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-[#5865F2]">
              <MessageSquare size={20} />
              <h3 className="font-bold text-white text-sm">
                {t("discordCommunityTitle", "Discord Community & Support")}
              </h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t(
                "discordCommunityDesc",
                "Found a bug, have a feature request, or want to share cards and lorebooks? Join our Discord server!"
              )}
            </p>
          </div>
          <button
            onClick={() => handleOpenLink(DISCORD_INVITE_URL)}
            className="w-full py-2.5 px-4 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20 cursor-pointer active:scale-95"
          >
            <span>{t("joinDiscord", "Join Discord Server")}</span>
            <ExternalLink size={13} />
          </button>
        </div>

        {/* GITHUB CARD */}
        <div className="p-5 bg-gray-900/60 border border-white/10 rounded-2xl flex flex-col justify-between space-y-4 hover:border-white/20 transition group">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-gray-300">
              <Github size={20} />
              <h3 className="font-bold text-white text-sm">
                {t("githubRepoTitle", "GitHub Repository & Issues")}
              </h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t(
                "githubRepoDesc",
                "Star the repository, explore release notes, or contribute to open-source development."
              )}
            </p>
          </div>
          <button
            onClick={() => handleOpenLink(GITHUB_REPO_URL)}
            className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 border border-white/10 cursor-pointer active:scale-95"
          >
            <span>{t("openGithub", "Open GitHub Repository")}</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* SYSTEM & DISPLAY DIAGNOSTICS */}
      <div className="p-6 bg-gray-900/50 rounded-3xl border border-white/5 space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-indigo-400" />
            <h3 className="font-bold text-white text-sm">
              {t("systemDiagnosticsTitle", "System & Display Diagnostics")}
            </h3>
          </div>
          <span className="text-[11px] text-gray-500">
            {t("diagnosticsLive", "Live client environment metrics")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* OS Tile */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              <Globe size={13} className="text-indigo-400" />
              <span>{t("operatingSystem", "Operating System")}</span>
            </div>
            <div className="text-xs font-bold text-white capitalize">
              {sysInfo.osType} {sysInfo.osVersion}
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              Arch: {sysInfo.osArch} | {sysInfo.osPlatform}
            </div>
          </div>

          {/* Screen Resolution */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              <Monitor size={13} className="text-emerald-400" />
              <span>{t("screenResolution", "Display Resolution")}</span>
            </div>
            <div className="text-xs font-bold text-white font-mono">
              {sysInfo.screenWidth} × {sysInfo.screenHeight}
            </div>
            <div className="text-[10px] text-gray-500">
              {sysInfo.colorDepth}-bit Color Depth
            </div>
          </div>

          {/* Viewport & DPI */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              <Maximize size={13} className="text-amber-400" />
              <span>{t("scaleAndDpi", "Scale & DPI Factor")}</span>
            </div>
            <div className="text-xs font-bold text-white font-mono">
              {sysInfo.pixelRatio}x (~{dpi} DPI)
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              Viewport: {sysInfo.viewportWidth} × {sysInfo.viewportHeight}
            </div>
          </div>

          {/* Device Model & Type */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              {sysInfo.isMobile ? (
                <Smartphone size={13} className="text-purple-400" />
              ) : (
                <HardDrive size={13} className="text-purple-400" />
              )}
              <span>{t("deviceModel", "Device Model")}</span>
            </div>
            <div className="text-xs font-bold text-white truncate" title={sysInfo.deviceModel}>
              {sysInfo.deviceModel}
            </div>
            <div className="text-[10px] text-gray-500">
              {sysInfo.isMobile ? t("mobileDevice", "Mobile / Tablet") : t("desktopDevice", "Desktop")} • {sysInfo.language}
            </div>
          </div>

          {/* Hardware CPU */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              <Cpu size={13} className="text-cyan-400" />
              <span>{t("cpuCores", "CPU Threads & Memory")}</span>
            </div>
            <div className="text-xs font-bold text-white">
              {sysInfo.cpuCores} {t("logicalCores", "Logical Cores")}
            </div>
            <div className="text-[10px] text-gray-500">
              RAM: {sysInfo.memory}
            </div>
          </div>

          {/* App Build */}
          <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
              <Layers size={13} className="text-rose-400" />
              <span>{t("appBuild", "TavernRev Build")}</span>
            </div>
            <div className="text-xs font-bold text-white font-mono">
              v{APP_VERSION}
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              Git Commit: {COMMIT_HASH}
            </div>
          </div>
        </div>

        {/* User Agent Collapsible or Details */}
        <div className="p-3 bg-black/40 border border-white/5 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t("userAgentEngine", "WebView Engine / User Agent")}
          </div>
          <p className="text-[11px] font-mono text-gray-400 break-all select-all leading-relaxed">
            {sysInfo.userAgent}
          </p>
        </div>
      </div>
    </div>
  );
}
