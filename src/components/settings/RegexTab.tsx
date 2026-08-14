import { useState } from "react";
import { Download, Save, Plus, Trash2, Eye, EyeOff, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { RegexScript } from "../../types";
import { useTranslation } from 'react-i18next';

interface RegexTabProps {
  regexScripts: RegexScript[];
  handleImportRegex: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportRegex: () => void;
  handleCreateScript: () => void;
  setEditingScript: (script: RegexScript | null) => void;
  handleDeleteScript: (id: number) => void;
  handleToggleScriptStatus: (script: RegexScript) => void;
  handleToggleGroupStatus: (groupId: string, isDisabled: boolean) => void;
  handleDeleteGroup: (groupId: string) => void;
}

export function RegexTab({
  regexScripts,
  handleImportRegex,
  handleExportRegex,
  handleCreateScript,
  setEditingScript,
  handleDeleteScript,
  handleToggleScriptStatus,
  handleToggleGroupStatus,
  handleDeleteGroup,
}: RegexTabProps) {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Group scripts by group_id
  const groupedScripts = regexScripts.reduce<Record<string, RegexScript[]>>((acc, script) => {
    if (script.group_id) {
      if (!acc[script.group_id]) {
        acc[script.group_id] = [];
      }
      acc[script.group_id].push(script);
    }
    return acc;
  }, {});

  const ungroupedScripts = regexScripts.filter((s) => !s.group_id);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const renderScriptItem = (script: RegexScript) => (
    <div
      key={script.id}
      className={`bg-gray-900 border border-white/5 rounded-xl p-4 flex items-center justify-between group/item hover:border-white/10 transition cursor-pointer ${
        script.disabled ? "opacity-50 grayscale" : ""
      }`}
      onClick={() => setEditingScript(script)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-bold text-gray-200">{script.script_name}</h3>
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
          {script.run_on_markdown && (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              UI/Markdown
            </span>
          )}
          {script.prompt_only && (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              Prompt Only
            </span>
          )}
        </div>
        <code className="text-xs text-gray-500 font-mono block truncate">{script.regex}</code>
      </div>
      <div className="flex gap-2 md:opacity-0 group-hover/item:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleScriptStatus(script);
          }}
          className="p-2 text-gray-500 hover:text-indigo-400 transition bg-gray-800 rounded-lg"
          title={script.disabled ? "Enable script" : "Disable script"}
        >
          {script.disabled ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
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
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white">{t("regexScripts", "Regex Scripts")}</h3>
          <p className="text-gray-400 text-sm">
            {t("automateActionsAndReplacementsUsingRegularExpressions", "Automate actions and replacements using Regular Expressions.")}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition cursor-pointer">
            <Download size={16} />
            {t("importRegex", "Import Regex")}
            <input type="file" accept=".json" multiple onChange={handleImportRegex} className="hidden" />
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
            <Plus size={16} /> {t("newScript", "New Script")}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Render Grouped Scripts */}
        {Object.entries(groupedScripts).map(([groupId, scripts]) => {
          const groupName = groupId.split("::")[0];
          const isCollapsed = collapsedGroups[groupId] !== false; // Collapse by default
          const isGroupDisabled = scripts.every((s) => s.disabled);
          const enabledCount = scripts.filter((s) => !s.disabled).length;

          return (
            <div key={groupId} className="border border-white/5 rounded-xl bg-gray-950/40 overflow-hidden">
              <div
                className="bg-gray-900/60 p-4 flex items-center justify-between cursor-pointer select-none border-b border-white/5"
                onClick={() => toggleGroupCollapse(groupId)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-gray-500">
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </div>
                  <Folder size={18} className="text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-200 truncate">{groupName}</h4>
                    <p className="text-xs text-gray-500">
                      {scripts.length} {t("scripts", "scripts")} ({enabledCount} {t("enabled", "enabled")})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleGroupStatus(groupId, !isGroupDisabled)}
                    className={`p-2 rounded-lg transition text-xs font-medium flex items-center gap-2 ${
                      isGroupDisabled
                        ? "bg-gray-800 text-gray-400 hover:text-white"
                        : "bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
                    }`}
                    title={isGroupDisabled ? "Enable all previously active scripts" : "Disable all scripts in group"}
                  >
                    {isGroupDisabled ? <EyeOff size={16} /> : <Eye size={16} />}
                    <span className="hidden sm:inline">{isGroupDisabled ? t("enableGroup", "Enable") : t("disableGroup", "Disable")}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(groupId)}
                    className="p-2 text-gray-500 hover:text-red-400 transition bg-gray-800 rounded-lg"
                    title="Delete group and all its scripts"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="p-4 space-y-3 bg-black/10 border-t border-white/5 animate-in slide-in-from-top-1 duration-200">
                  {scripts.map(renderScriptItem)}
                </div>
              )}
            </div>
          );
        })}

        {/* Render Ungrouped Scripts */}
        {ungroupedScripts.map(renderScriptItem)}

        {regexScripts.length === 0 && (
          <div className="text-center py-12 text-gray-600 italic border border-dashed border-white/10 rounded-xl">
            {t("noRegexScriptsCreated", "No regex scripts created.")}
          </div>
        )}
      </div>
    </div>
  );
}
