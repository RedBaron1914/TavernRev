import { Upload, Save, Plus, Trash2 } from "lucide-react";
import { RegexScript } from "../../types";

interface RegexTabProps {
  regexScripts: RegexScript[];
  handleImportRegex: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportRegex: () => void;
  handleCreateScript: () => void;
  setEditingScript: (script: RegexScript | null) => void;
  handleDeleteScript: (id: number) => void;
}

export function RegexTab({
  regexScripts,
  handleImportRegex,
  handleExportRegex,
  handleCreateScript,
  setEditingScript,
  handleDeleteScript,
}: RegexTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white">Regex Scripts</h3>
          <p className="text-gray-400 text-sm">
            Automate actions and replacements using Regular Expressions.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition cursor-pointer">
            <Upload size={16} />
            <input
              type="file"
              accept=".json"
              onChange={handleImportRegex}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExportRegex}
            className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
          >
            <Save size={16} />
          </button>
          <button
            onClick={handleCreateScript}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
          >
            <Plus size={16} /> New Script
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {regexScripts.map((script) => (
          <div
            key={script.id}
            className="bg-gray-900 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition cursor-pointer"
            onClick={() => setEditingScript(script)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-bold text-gray-200">
                  {script.script_name}
                </h3>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                    script.placement === "both"
                      ? "bg-indigo-500/20 text-indigo-400"
                      : script.placement === "user"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-purple-500/20 text-purple-400"
                  }`}
                >
                  {script.placement}
                </span>
              </div>
              <code className="text-xs text-gray-500 font-mono block truncate">
                {script.regex}
              </code>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteScript(script.id);
                }}
                className="p-2 text-gray-500 hover:text-red-400 transition bg-gray-800 rounded-lg"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {regexScripts.length === 0 && (
          <div className="text-center py-12 text-gray-600 italic border border-dashed border-white/10 rounded-xl">
            No regex scripts created.
          </div>
        )}
      </div>
    </div>
  );
}
