import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Image, Cpu } from "lucide-react";
import { UserPersona } from "../types";
import Avatar from "./Avatar";

const PersonaEditor = ({
  persona,
  onSave,
  onCancel,
}: {
  persona: UserPersona;
  onSave: (p: UserPersona) => void;
  onCancel: () => void;
}) => {
  const [formData, setFormData] = useState(persona);
  const [tokens, setTokens] = useState(0);
  const handleChange = (field: keyof UserPersona, value: string) =>
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
      const text = `${formData.name}\n${formData.description}`;
      try {
        const count = await invoke<number>("count_tokens", { text });
        setTokens(count);
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] border border-white/10 overflow-hidden ring-1 ring-white/10">
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
              <Avatar
                src={formData.avatar}
                name={formData.name}
                size="lg"
                type="user"
              />
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
                Edit Persona
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
        </div>
        <div className="p-5 flex justify-end gap-3 border-t border-white/10 bg-gray-900">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl hover:bg-white/10 text-sm font-medium text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonaEditor;
