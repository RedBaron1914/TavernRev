import { Link, Save, ChevronRight, Server, Database, RefreshCw, Zap } from "lucide-react";
import { 
    ConnectionProfile, 
    API_TYPES, 
    CHAT_SOURCES, 
    POST_PROCESSING_OPTIONS, 
    DEFAULT_CONNECTION_PROFILE,
    InputField,
    SelectField,
    Slider,
    Toggle 
} from "../../Settings";

interface ConnectionTabProps {
  connectionData: ConnectionProfile;
  setConnectionData: (data: ConnectionProfile) => void;
  activeProfileName: string | null;
  setActiveProfileName: (name: string | null) => void;
  connectionProfiles: string[];
  handleConnectionChange: (field: keyof ConnectionProfile, value: any) => void;
  handleDeleteConnection: () => void;
  handleSaveConnection: () => void;
  fetchedModels: string[];
  handleFetchModels: () => void;
  retryEnabled: boolean;
  setRetryEnabled: (val: boolean) => void;
  retryTriggers: string;
  setRetryTriggers: (val: string) => void;
  retryDelay: number;
  setRetryDelay: (val: number) => void;
}

export function ConnectionTab({
  connectionData,
  setConnectionData,
  activeProfileName,
  setActiveProfileName,
  connectionProfiles,
  handleConnectionChange,
  handleDeleteConnection,
  handleSaveConnection,
  fetchedModels,
  handleFetchModels,
  retryEnabled,
  setRetryEnabled,
  retryTriggers,
  setRetryTriggers,
  retryDelay,
  setRetryDelay,
}: ConnectionTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Profile Manager */}
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-300 flex items-center gap-2">
            <Link size={20} /> Connection Profile
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConnectionData(DEFAULT_CONNECTION_PROFILE);
                setActiveProfileName(null);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-white/5"
            >
              New
            </button>
            <button
              onClick={handleDeleteConnection}
              className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-red-900/30 text-red-400 hover:text-red-300 rounded-lg transition border border-white/5"
            >
              Delete
            </button>
            <button
              onClick={handleSaveConnection}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-lg shadow-indigo-500/20"
            >
              <Save size={14} /> Save Profile
            </button>
          </div>
        </div>
        <div className="relative">
          <select
            value={activeProfileName || ""}
            onChange={(e) => setActiveProfileName(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 appearance-none shadow-inner"
          >
            <option value="" disabled>
              Select a profile...
            </option>
            {connectionProfiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-3.5 pointer-events-none text-gray-500">
            <ChevronRight size={16} className="rotate-90" />
          </div>
        </div>
      </div>

      {/* API Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-5">
          <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
            <Server size={20} /> API Settings
          </h3>

          <SelectField
            label="API Type"
            value={connectionData.api_type}
            onChange={(v: any) => handleConnectionChange("api_type", v)}
            options={API_TYPES}
          />

          {connectionData.api_type === "chat_completion" && (
            <SelectField
              label="Chat Source"
              value={connectionData.chat_source}
              onChange={(v: any) => handleConnectionChange("chat_source", v)}
              options={CHAT_SOURCES}
            />
          )}

          {(connectionData.api_type === "chat_completion" ||
            connectionData.api_type === "text_completion") &&
            connectionData.chat_source === "custom" && (
              <InputField
                label="Base URL"
                value={connectionData.base_url}
                onChange={(v: any) => handleConnectionChange("base_url", v)}
                placeholder="http://127.0.0.1:5000/v1"
              />
            )}

          <div className="pt-2">
            <InputField
              label="API Key"
              type="password"
              value={connectionData.api_key}
              onChange={(v: any) => handleConnectionChange("api_key", v)}
              placeholder={
                connectionData.chat_source === "custom"
                  ? "Optional for local LLMs"
                  : "sk-..."
              }
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-5">
            <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              <Database size={20} /> Model Selection
            </h3>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <InputField
                  label="Enter Model ID"
                  value={connectionData.model_id}
                  onChange={(v: any) => handleConnectionChange("model_id", v)}
                  placeholder="gpt-4, meta-llama/Llama-3..."
                />
              </div>
              <button
                onClick={handleFetchModels}
                className="p-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl mb-0.5 text-gray-300 transition"
                title="Fetch Available Models"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {fetchedModels.length > 0 && (
              <SelectField
                label="Available Models"
                value={connectionData.model_id}
                onChange={(v: any) => handleConnectionChange("model_id", v)}
                options={fetchedModels.map((m) => ({
                  value: m,
                  label: m,
                }))}
              />
            )}

            <div className="pt-4 mt-2 border-t border-white/5">
              <Slider
                label="Context Size"
                field="context_size"
                value={connectionData.context_size}
                min={512}
                max={2000000}
                step={512}
                onChange={handleConnectionChange}
                helpText="Max tokens for prompt + response (Context Window)."
              />
            </div>
          </div>

          <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-5">
            <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
              <Zap size={20} /> Post-Processing
            </h3>
            <SelectField
              label="Strategy"
              value={connectionData.post_processing}
              onChange={(v: any) => handleConnectionChange("post_processing", v)}
              options={POST_PROCESSING_OPTIONS}
            />
          </div>

          <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
              <RefreshCw size={20} /> Auto-Retry Strategy
            </h3>
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <label className="text-sm text-gray-300 font-medium">Enable Auto-Retry</label>
              <Toggle field="retry" value={retryEnabled} onChange={() => setRetryEnabled(!retryEnabled)} />
            </div>
            {retryEnabled && (
              <>
                <InputField
                  label="Trigger Phrases (comma separated)"
                  value={retryTriggers}
                  onChange={setRetryTriggers}
                  placeholder="429, 503, overloaded..."
                />
                <InputField
                  label="Retry Delay (seconds)"
                  value={retryDelay}
                  onChange={setRetryDelay}
                  type="number"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
