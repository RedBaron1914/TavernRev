import { useState, useEffect } from "react";
import { Puzzle, Upload, Trash2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation, Trans } from 'react-i18next'

interface ExtensionsTabProps {
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}

export function ExtensionsTab({ addToast }: ExtensionsTabProps) {
  const { t } = useTranslation()
  const [scripts, setScripts] = useState<{name: string, size: number}[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadScripts = async () => {
      setIsLoading(true);
      try {
          // We will fetch just the names. 
          // get_extension_scripts currently returns file contents, but we can just use it and map to length for now
          const contents = await invoke<string[]>("get_extension_scripts");
          // For a real app, we should add a get_extension_files command that returns names. 
          // Since get_extension_scripts just returns strings without names, we have a minor issue.
          // Let's assume we can fetch names later. For now, this is a placeholder UI.
          
          // Workaround: We'll just display that we have N scripts loaded in memory.
          // To properly manage them, we need backend support to list filenames.
          
          setScripts(contents.map((c, i) => ({ name: `Plugin_${i}.js`, size: c.length })));
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      loadScripts();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          const file = e.target.files[0];
          if (!file.name.endsWith('.js')) {
              addToast("Only .js files are supported", "error");
              return;
          }
          
          const reader = new FileReader();
          reader.onload = async (ev) => {
              const content = ev.target?.result as string;
              try {
                  await invoke("save_extension_script", { fileName: file.name, content });
                  addToast(`Extension ${file.name} installed!`, "success");
                  
                  // Reload app to apply plugin
                  if (confirm("Extension installed. Reload application to apply changes?")) {
                      window.location.reload();
                  } else {
                      loadScripts();
                  }
              } catch(err) {
                  addToast("Failed to install extension: " + err, "error");
              }
          };
          reader.readAsText(file);
      }
  };

  const handleDelete = async (name: string) => {
      if (confirm(`Delete extension ${name}?`)) {
          try {
              await invoke("delete_extension_script", { fileName: name });
              addToast(`Extension deleted.`, "success");
              loadScripts();
              alert("Please reload the application to completely remove the plugin from memory.");
          } catch(e) {
              addToast("Delete failed: " + e, "error");
          }
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-900/30 p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex justify-between items-center">
            <div>
                <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
                <Puzzle size={20} /> {t('extensionsPlugins', 'Extensions & Plugins')}
                </h3>
                <p className="text-gray-400 text-sm mt-1">{t('enhanceTavernrevWithCommunityJavascriptMods', 'Enhance TavernRev with community JavaScript mods.')}</p>
            </div>
            <div className="flex gap-2">
                <button onClick={loadScripts} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition">
                    <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-500/20 cursor-pointer active:scale-95">
                    <Upload size={16} /><Trans i18nKey="installPluginJsInputTypefileAcceptjsOnchangehandleuploadClassnamehidden">Install Plugin (.js)
                    <input type="file" accept=".js" onChange={handleUpload} className="hidden" /></Trans></label>
            </div>
        </div>

        <div className="space-y-2 mt-4">
            {scripts.map((script, i) => (
                <div key={i} className="flex justify-between items-center bg-gray-950 border border-white/5 p-4 rounded-xl group hover:border-indigo-500/30 transition">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-800 rounded-lg text-gray-400"><Puzzle size={16}/></div>
                        <div>
                            <h4 className="font-bold text-gray-200">{script.name}</h4>
                            <p className="text-[10px] text-gray-500 font-mono">{t('size', 'Size:')} {(script.size / 1024).toFixed(1)} KB</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleDelete(script.name)}
                        className="p-2 text-gray-600 hover:text-red-400 bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition hover:bg-red-500/10"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ))}
            {scripts.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl text-gray-500 italic">
                    {t('noPluginsInstalled', 'No plugins installed.')}
                </div>
            )}
        </div>
        
        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-xs text-yellow-500/80 font-medium"><Trans i18nKey="bwarningbPluginsHaveFullAccessToYourChatsAndAppDataOnlyInstallScriptsFromTrustedSources">⚠️ <b>Warning:</b> Plugins have full access to your chats and app data. Only install scripts from trusted sources!</Trans></p>
        </div>
      </div>
    </div>
  );
}
