import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Terminal } from "lucide-react";

interface AdvancedTabProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  setShowConsole: (show: boolean) => void;
}

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export function AdvancedTab({
  addToast,
  setShowConsole,
}: AdvancedTabProps) {
  const openConsoleWindow = async () => {
    if (isMobile) {
      setShowConsole(true);
      return;
    }

    try {
      const existingWindow = await WebviewWindow.getByLabel("system-console");
      if (existingWindow) {
        await existingWindow.show();
        await existingWindow.setFocus();
        return;
      }

      const consoleWindow = new WebviewWindow("system-console", {
        title: "System Console",
        url: "/?view=console",
        width: 1100,
        height: 720,
        minWidth: 720,
        minHeight: 480,
        center: true,
      });

      consoleWindow.once("tauri://error", (e) => {
        console.error("Failed to open system console window:", e);
        addToast("Failed to open system console window", "error");
      });
    } catch (e) {
      console.error("Failed to open system console window:", e);
      addToast("Failed to open system console window", "error");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-lg font-bold text-white">Debug Tools</h3>
        <p className="text-gray-400 text-sm">
          Use these tools to diagnose issues.
        </p>

        <button
          onClick={openConsoleWindow}
          className="w-full bg-gray-800 hover:bg-gray-700 text-white p-4 rounded-xl flex items-center justify-between group transition border border-white/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black/50 rounded-lg flex items-center justify-center text-green-400">
              <Terminal size={20} />
            </div>
            <div className="text-left">
              <div className="font-bold">System Console</div>
              <div className="text-xs text-gray-500">
                View app logs and errors
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
