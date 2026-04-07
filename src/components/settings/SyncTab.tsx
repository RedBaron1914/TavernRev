import { Cloud, Upload, CheckCircle, Lock, RefreshCw } from "lucide-react";
import { Toggle } from "../../Settings";

interface SyncTabProps {
  syncProvider: "dropbox" | "gdrive" | null;
  handleSyncProviderChange: (p: "dropbox" | "gdrive") => void;
  isDropboxConnected: boolean;
  isGDriveConnected: boolean;
  handleConnectDropbox: () => void;
  handleConnectGDrive: () => void;
  handleLogoutDropbox: () => void;
  handleLogoutGDrive: () => void;
  handlePush: () => void;
  handlePull: () => void;
  isPushing: boolean;
  isPulling: boolean;
  syncStatus: string | null;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (val: boolean) => void;
}

export function SyncTab({
  syncProvider,
  handleSyncProviderChange,
  isDropboxConnected,
  isGDriveConnected,
  handleConnectDropbox,
  handleConnectGDrive,
  handleLogoutDropbox,
  handleLogoutGDrive,
  handlePush,
  handlePull,
  isPushing,
  isPulling,
  syncStatus,
  autoSyncEnabled,
  setAutoSyncEnabled,
}: SyncTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-900/30 p-8 rounded-3xl border border-white/5 flex flex-col items-center text-center space-y-6">
        <div className="flex bg-black/50 p-1 rounded-xl mb-4">
          <button
            onClick={() => handleSyncProviderChange("dropbox")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              syncProvider === "dropbox"
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Dropbox
          </button>
          <button
            onClick={() => handleSyncProviderChange("gdrive")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              syncProvider === "gdrive"
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Google Drive
          </button>
        </div>

        <div
          className={`p-4 rounded-full ${
            syncProvider === "dropbox" && isDropboxConnected
              ? "bg-indigo-500/20 text-indigo-400"
              : syncProvider === "gdrive" && isGDriveConnected
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-gray-800 text-gray-500"
          }`}
        >
          <Cloud size={48} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">
            Cloud Synchronization
          </h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto">
            Keep your characters and chats in sync across devices using your personal {syncProvider === "dropbox" ? "Dropbox" : "Google Drive"} account.
          </p>
        </div>

        {syncProvider === "dropbox" && !isDropboxConnected && (
          <button
            onClick={handleConnectDropbox}
            className="flex items-center gap-3 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition shadow-xl shadow-indigo-900/20 active:scale-95"
          >
            Connect Dropbox Account
          </button>
        )}

        {syncProvider === "gdrive" && !isGDriveConnected && (
          <button
            onClick={handleConnectGDrive}
            className="flex items-center gap-3 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition shadow-xl shadow-emerald-900/20 active:scale-95"
          >
            Connect Google Drive
          </button>
        )}

        {((syncProvider === "dropbox" && isDropboxConnected) ||
          (syncProvider === "gdrive" && isGDriveConnected)) && (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 py-2 rounded-xl border border-emerald-500/20">
              <CheckCircle size={18} />{" "}
              {syncProvider === "dropbox" ? "Dropbox" : "Google Drive"} Connected
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handlePush}
                disabled={isPushing || isPulling}
                className={`flex flex-col items-center gap-2 p-4 bg-gray-800 hover:bg-gray-700 rounded-2xl border border-white/5 transition ${
                  isPushing ? "opacity-50 cursor-wait" : ""
                }`}
              >
                <Upload size={20} className={isPushing ? "animate-bounce" : ""} />
                <span className="text-xs font-bold text-center">
                  {isPushing && syncStatus ? syncStatus : "Push to Cloud"}
                </span>
              </button>
              <button
                onClick={handlePull}
                disabled={isPushing || isPulling}
                className={`flex flex-col items-center gap-2 p-4 bg-gray-800 hover:bg-gray-700 rounded-2xl border border-white/5 transition ${
                  isPulling ? "opacity-50 cursor-wait" : ""
                }`}
              >
                <RefreshCw size={20} className={isPulling ? "animate-spin" : ""} />
                <span className="text-xs font-bold text-center">
                  {isPulling && syncStatus ? syncStatus : "Pull from Cloud"}
                </span>
              </button>
            </div>
            <div className="pt-2 border-t border-white/5">
              <Toggle
                label="Enable Real-Time Auto-Sync"
                field="autoSync"
                value={autoSyncEnabled}
                onChange={(_: any, newValue: any) => {
                  setAutoSyncEnabled(newValue);
                  localStorage.setItem("cloud_auto_sync", newValue.toString());
                }}
                helpText="Silently syncs chats to the cloud 5 seconds after you finish typing."
              />
            </div>

            <button
              onClick={syncProvider === "dropbox" ? handleLogoutDropbox : handleLogoutGDrive}
              className="text-xs text-gray-500 hover:text-red-400 transition"
            >
              Disconnect Account
            </button>
          </div>
        )}

        <div className="pt-4 flex items-center gap-2 text-[10px] text-gray-600 uppercase font-bold tracking-widest">
          <Lock size={12} /> App Folder Access Only
        </div>
      </div>
    </div>
  );
}
