import { useState, useEffect } from "react";
import { X, Image, Cpu, Plus, Trash2, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "../Avatar";
import { Character } from "../../types";

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

export const CharacterEditor = ({ 
  character,
  onSave,
  onCancel,
  addToast,
}: { 
  character: Character;
  onSave: (char: Character) => void;
  onCancel: () => void;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}) => {
  const [formData, setFormData] = useState(character);
  const [alts, setAlts] = useState<string[]>(() => {
    try {
      return JSON.parse(character.alternate_greetings || "[]");
    } catch {
      return [];
    }
  });
  const [talkativeness, setTalkativeness] = useState<number>(() => {
    try {
      const cardData = JSON.parse(character.card_data || "{}");
      return (
        cardData?.extensions?.talkativeness ??
        cardData?.data?.extensions?.talkativeness ??
        0.5
      );
    } catch {
      return 0.5;
    }
  });
  const [tokens, setTokens] = useState(0);

  const handleChange = (field: keyof Character, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const bytes = Array.from(
            new Uint8Array(ev.target.result as ArrayBuffer),
          );
          try {
            const newFilename = await invoke<string>("upload_avatar", {
              data: bytes,
            });
            handleChange("avatar", newFilename);
          } catch (err) {
            console.error(err);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      const text = `${formData.name}\n${formData.description}\n${formData.personality}\n${formData.scenario}\n${formData.first_mes}\n${formData.creator_notes}\n${alts.join("\n")}`;
      try {
        const count = await invoke<number>("count_tokens", { text });
        setTokens(count);
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, alts]);

  const handleSave = () => {
    let cardDataObj: any = {};
    try {
      cardDataObj = JSON.parse(formData.card_data || "{}");
    } catch (e) {}
    if (!cardDataObj.extensions) cardDataObj.extensions = {};
    cardDataObj.extensions.talkativeness = talkativeness;

    onSave({
      ...formData,
      card_data: JSON.stringify(cardDataObj),
      alternate_greetings: JSON.stringify(alts),
    });
  };

  const handleExportChar = async () => {
    try {
      const json = await invoke<string>("export_character_json", {
        id: formData.id,
      });
      const filename = `${formData.name.replace(/[/\\?%*:|"<>]/g, "_")}.json`;

      if (isMobile) {
        if (
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({
            files: [new File([json], filename, { type: "application/json" })],
          })
        ) {
          try {
            const file = new File([json], filename, { 
              type: "application/json",
            });
            await navigator.share({
              files: [file],
              title: "Export Character",
              text: `TavernRev Character Export: ${filename}`,
            });
            return;
          } catch (e) {
            console.warn("Share failed", e);
          }
        }

        try {
          await navigator.clipboard.writeText(json);
          addToast("Share failed. Character JSON copied to clipboard!", "info");
        } catch (e) {
          addToast("Export failed: " + e, "error");
        }
        return;
      }

      try {
        const savedPath = await invoke<string>("save_export_file", {
          filename,
          content: json,
        });
        addToast(`Character saved to Downloads folder!\nPath: ${savedPath}`, "success");
        return;
      } catch (err) {
        console.warn("Rust save failed, falling back", err);
      }

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast("Export failed: " + e, "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-white/10 overflow-hidden ring-1 ring-white/10">
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
              <Avatar src={formData.avatar} name={formData.name} size="lg" type="user" />
              <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center md:opacity-0 group-hover:opacity-100 transition">
                <Image size={20} className="text-white" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Edit Character
              </h2>
              <div className="flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-gray-900 rounded text-[10px] font-mono text-cyan-400 w-fit">
                <Cpu size={10} /> {tokens} tokens
              </div>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar bg-gray-950/50">
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Name
            </label>
            <input
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={4}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Personality
            </label>
            <textarea
              value={formData.personality}
              onChange={(e) => handleChange("personality", e.target.value)}
              rows={3}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Scenario
            </label>
            <textarea
              value={formData.scenario}
              onChange={(e) => handleChange("scenario", e.target.value)}
              rows={3}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              First Message
            </label>
            <textarea
              value={formData.first_mes}
              onChange={(e) => handleChange("first_mes", e.target.value)}
              rows={5}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center ml-1">
              <label className="text-sm text-gray-300 font-medium">
                Message Examples
              </label>
              <span className="text-[10px] text-gray-500">Use &lt;START&gt; to separate blocks</span>
            </div>
            <textarea
              value={formData.mes_example}
              onChange={(e) => handleChange("mes_example", e.target.value)}
              rows={6}
              placeholder="<START>\n{{user}}: Hello!\n{{char}}: Hi there!"
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1 flex justify-between">
              <span>Talkativeness (Group Chats)</span>
              <span className="text-indigo-400 font-mono">{Math.round(talkativeness * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={talkativeness}
              onChange={(e) => setTalkativeness(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 bg-gray-800 rounded-lg appearance-none h-2 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500 ml-1 leading-tight">
              0% = Only talks if mentioned by name. 100% = High chance to reply randomly.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/5">
            <div className="flex justify-between items-center">
                <label className="text-sm text-gray-300 font-medium ml-1">Alternate Greetings</label>
                <button onClick={() => setAlts([...alts, ""])} className="text-xs text-indigo-400 hover:text-white flex items-center gap-1"><Plus size={14}/> Add</button>
            </div>
            {alts.map((alt, i) => (
                <div key={i} className="flex gap-2">
                    <textarea 
                        value={alt} 
                        onChange={e => {
                            const n = [...alts];
                            n[i] = e.target.value;
                            setAlts(n);
                        }}
                        rows={3}
                        className="flex-1 bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
                        placeholder={`Greeting #${i+2}`}
                    />
                    <button onClick={() => setAlts(alts.filter((_, idx) => idx !== i))} className="p-2 h-fit bg-gray-800 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded-lg transition"><Trash2 size={16}/></button>
                </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Creator Notes
            </label>
            <textarea
              value={formData.creator_notes}
              onChange={(e) => handleChange("creator_notes", e.target.value)}
              rows={2}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-gray-300 font-medium ml-1">
              Tags (comma separated)
            </label>
            <input
              value={(() => {
                try {
                  return JSON.parse(formData.tags || "[]").join(", ");
                } catch {
                  return formData.tags;
                }
              })()}
              onChange={(e) => {
                const tagsArray = e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
                handleChange("tags", JSON.stringify(tagsArray));
              }}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="p-5 flex justify-end gap-3 border-t border-white/10 bg-gray-900">
          <button
            onClick={handleExportChar}
            className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-sm font-medium text-indigo-400 flex items-center gap-2 transition"
            title="Export to V2 JSON"
          >
            <Download size={18} /> Export JSON
          </button>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-sm font-medium text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg"
          >
            Save Character
          </button>
        </div>
      </div>
    </div>
  );
};
