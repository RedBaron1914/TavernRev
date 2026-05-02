import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Brain } from "lucide-react";
import { Toggle, InputField } from "./settings/shared";

export const RagSettingsTab = ({ 
  chatId,
  addToast,
  compact = false,
}: { 
  chatId: number | null;
  addToast: (msg: string, type?: "info" | "error" | "success") => void;
  compact?: boolean;
}) => {
  const [ragEnabled, setRagEnabled] = useState(localStorage.getItem("rag_enabled") === "true");
  const [ragApiType, setRagApiType] = useState<"local" | "api">(
    (localStorage.getItem("rag_api_type") as "local" | "api") || "local"
  );
  const [ragApiUrl, setRagApiUrl] = useState(localStorage.getItem("rag_api_url") || "");
  const [ragApiKey, setRagApiKey] = useState(localStorage.getItem("rag_api_key") || "");
  const [ragApiModel, setRagApiModel] = useState(localStorage.getItem("rag_api_model") || "text-embedding-3-small");
  
  const [ragModel, setRagModel] = useState(localStorage.getItem("rag_model") || "MultilingualE5Small");
  const [ragCustomModelPath, setRagCustomModelPath] = useState(localStorage.getItem("rag_custom_model_path") || "");
  const [ragChunkSize, setRagChunkSize] = useState(parseInt(localStorage.getItem("rag_chunk_size") || "4"));
  const [ragOverlap, setRagOverlap] = useState(parseInt(localStorage.getItem("rag_overlap") || "1"));
  const [ragTopK, setRagTopK] = useState(parseInt(localStorage.getItem("rag_top_k") || "3"));
  const [ragThreshold, setRagThreshold] = useState(parseFloat(localStorage.getItem("rag_threshold") || "0.5"));
  const [ragTemplate, setRagTemplate] = useState(
    localStorage.getItem("rag_template") || "[System Note: Relevant context from past memory:\n{{text}}\n]"
  );

  useEffect(() => {
    localStorage.setItem("rag_enabled", ragEnabled.toString());
    localStorage.setItem("rag_api_type", ragApiType);
    localStorage.setItem("rag_api_url", ragApiUrl);
    localStorage.setItem("rag_api_key", ragApiKey);
    localStorage.setItem("rag_api_model", ragApiModel);
    localStorage.setItem("rag_model", ragModel);
    localStorage.setItem("rag_custom_model_path", ragCustomModelPath);
    localStorage.setItem("rag_chunk_size", ragChunkSize.toString());
    localStorage.setItem("rag_overlap", ragOverlap.toString());
    localStorage.setItem("rag_top_k", ragTopK.toString());
    localStorage.setItem("rag_threshold", ragThreshold.toString());
    localStorage.setItem("rag_template", ragTemplate);
  }, [ragEnabled, ragApiType, ragApiUrl, ragApiKey, ragApiModel, ragModel, ragCustomModelPath, ragChunkSize, ragOverlap, ragTopK, ragThreshold, ragTemplate]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={`bg-gray-900/30 rounded-2xl border border-white/5 space-y-6 ${compact ? "p-4" : "p-6"}`}>
        <div className={`pb-4 border-b border-white/5 ${compact ? "space-y-3" : "flex items-center justify-between"}`}>
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Brain size={24} className="text-purple-400" /> Long-Term Memory (RAG)
            </h3>
            <p className="text-sm text-gray-400 mt-1">Automatically embed and recall past chat history using local AI models.</p>
          </div>
          <Toggle label="Enabled" field="ragEnabled" value={ragEnabled} onChange={() => setRagEnabled(!ragEnabled)} />
        </div>

        <div className={`space-y-6 transition-opacity duration-300 ${ragEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-300">Embedding Engine</h4>
            
            <div className="flex gap-2">
              <button
                onClick={() => setRagApiType("local")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                  ragApiType === "local" ? "bg-purple-600/20 border-purple-500/50 text-purple-300" : "bg-gray-900 border-white/10 text-gray-500 hover:text-gray-300"
                }`}
              >
                Local (FastEmbed)
              </button>
              <button
                onClick={() => setRagApiType("api")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                  ragApiType === "api" ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300" : "bg-gray-900 border-white/10 text-gray-500 hover:text-gray-300"
                }`}
              >
                External API
              </button>
            </div>

            {ragApiType === "local" ? (
              <div className="space-y-3 p-4 bg-gray-950/50 rounded-xl border border-white/5">
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-2">Embedding Model</label>
                  <select
                    value={ragModel}
                    onChange={(e) => setRagModel(e.target.value)}
                    className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none appearance-none"
                  >
                    <option value="MultilingualE5Small">Multilingual E5 Small (Recommended, 100 languages, ~120MB)</option>
                    <option value="AllMiniLML6V2">All MiniLM L6 v2 (English Only, Fastest, ~90MB)</option>
                    <option value="NomicEmbedText">Nomic Embed Text (English, High Quality, ~130MB)</option>
                    <option value="Custom">Custom Local Model (ONNX Folder)</option>
                  </select>
                </div>
                {ragModel === "Custom" && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <InputField
                        label="Path to Custom ONNX Folder"
                        value={ragCustomModelPath}
                        onChange={setRagCustomModelPath}
                        placeholder="C:/models/my-embedding-model/"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-4 bg-gray-950/50 rounded-xl border border-white/5">
                <InputField
                  label="API URL"
                  value={ragApiUrl}
                  onChange={setRagApiUrl}
                  placeholder="https://api.openai.com/v1/embeddings"
                />
                <InputField
                  label="API Key"
                  value={ragApiKey}
                  onChange={setRagApiKey}
                  placeholder="sk-..."
                  type="password"
                />
                <InputField
                  label="Model ID"
                  value={ragApiModel}
                  onChange={setRagApiModel}
                  placeholder="text-embedding-3-small"
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5">
            <h4 className="text-sm font-bold text-gray-300 mb-4">Indexing Strategy</h4>
            <div className="grid grid-cols-1 gap-6">
              <InputField
                label="Messages per Chunk"
                type="number"
                value={ragChunkSize.toString()}
                onChange={(v: string) => setRagChunkSize(parseInt(v) || 4)}
                placeholder="4"
              />
              <InputField
                label="Chunk Overlap (Messages)"
                type="number"
                value={ragOverlap.toString()}
                onChange={(v: string) => setRagOverlap(parseInt(v) || 1)}
                placeholder="1"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h4 className="text-sm font-bold text-gray-300 mb-4">Retrieval Strategy</h4>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-gray-400">Top-K Results</label>
                  <span className="text-sm text-white font-mono">{ragTopK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={ragTopK}
                  onChange={(e) => setRagTopK(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-gray-400">Min Similarity Threshold</label>
                  <span className="text-sm text-white font-mono">{ragThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ragThreshold}
                  onChange={(e) => setRagThreshold(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h4 className="text-sm font-bold text-gray-300 mb-2">Injection Template</h4>
            <textarea
              value={ragTemplate}
              onChange={(e) => setRagTemplate(e.target.value)}
              className="w-full h-32 bg-gray-950 border border-white/10 rounded-xl p-3 text-sm text-white font-mono focus:border-indigo-500 outline-none resize-none custom-scrollbar"
            />
            <p className="text-xs text-gray-500 mt-2">
              Use <code className="text-indigo-400">{"{{text}}"}</code> to inject the retrieved memory text.
            </p>
          </div>

          <div className={`pt-4 ${compact ? "grid grid-cols-1 gap-3" : "flex gap-3"}`}>
            <button
              onClick={async () => {
                try {
                  if (ragApiType === "api") {
                    addToast("API Configuration selected (Tested on generation)", "info");
                  } else if (ragModel === "Custom") {
                    if (!ragCustomModelPath) return addToast("Please specify a path", "error");
                    const msg = await invoke<string>("init_custom_vector_model", { folderPath: ragCustomModelPath });
                    addToast(msg, "success");
                  } else {
                    const msg = await invoke<string>("init_vector_model", { modelName: ragModel });
                    addToast(msg, "success");
                  }
                } catch (e) {
                  addToast(String(e), "error");
                }
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition"
            >
              Test / Initialize Model
            </button>
            <button
              onClick={async () => {
                if (!chatId) return addToast("Open a chat first", "error");
                try {
                  addToast("Indexing chat...", "info");
                  const count = await invoke<number>("build_chat_index", {
                    chatId,
                    chunkSize: ragChunkSize,
                    overlap: ragOverlap,
                    config: {
                      enabled: ragEnabled,
                      top_k: ragTopK,
                      threshold: ragThreshold,
                      injection_depth: 0,
                      template: ragTemplate,
                      api_type: ragApiType,
                      api_url: ragApiUrl,
                      api_key: ragApiKey,
                      api_model: ragApiModel
                    }
                  });
                  addToast(`Indexing complete: ${count} chunks embedded.`, "success");
                } catch (e) {
                  addToast(String(e), "error");
                }
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition"
            >
              Index Current Chat Now
            </button>
            <button
              onClick={async () => {
                if (!chatId) return addToast("Open a chat first", "error");
                try {
                  addToast("Indexing lorebooks...", "info");
                  const count = await invoke<number>("build_lorebook_index", {
                    chatId,
                    chunkSize: ragChunkSize,
                    overlap: ragOverlap,
                    config: {
                      enabled: ragEnabled,
                      top_k: ragTopK,
                      threshold: ragThreshold,
                      injection_depth: 0,
                      template: ragTemplate,
                      api_type: ragApiType,
                      api_url: ragApiUrl,
                      api_key: ragApiKey,
                      api_model: ragApiModel
                    }
                  });
                  addToast(`Lorebook indexing complete: ${count} chunks embedded.`, "success");
                } catch (e) {
                  addToast(String(e), "error");
                }
              }}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-sm transition"
            >
              Index Active Lorebooks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
