import { Plus, Star, Edit, Trash2, UserCircle } from "lucide-react";
import Avatar from "../Avatar";
import { UserPersona } from "../../types";

interface PersonaTabProps {
  userPersonas: UserPersona[];
  handleCreatePersona: () => void;
  handleSetDefaultPersona: (id: number) => void;
  setEditingPersona: (p: UserPersona | null) => void;
  handleDeletePersona: (id: number, name: string) => void;
}

export function PersonaTab({
  userPersonas,
  handleCreatePersona,
  handleSetDefaultPersona,
  setEditingPersona,
  handleDeletePersona,
}: PersonaTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-gray-300">Your Personas</h3>
        <button
          onClick={handleCreatePersona}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-white font-bold text-sm transition shadow-lg shadow-indigo-500/20"
        >
          <Plus size={16} /> Add Persona
        </button>
      </div>
      <div className="grid gap-4 w-full overflow-hidden">
        {(userPersonas || []).map((p) => (
          <div
            key={p.id}
            className="bg-gray-900/40 p-4 rounded-2xl border border-white/5 flex items-center gap-4 hover:border-indigo-500/30 transition group min-w-0"
          >
            <Avatar src={p.avatar} name={p.name} size="lg" type="user" />
            <div className="flex-1 min-w-0 overflow-hidden">
              <h4 className="font-bold text-lg text-white truncate">{p.name}</h4>
              <p className="text-sm text-gray-500 truncate">
                {p.description || "No description provided."}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSetDefaultPersona(p.id);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title={p.is_default ? "Default Persona" : "Set as Default"}
            >
              <Star
                size={18}
                className={
                  p.is_default
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-600 hover:text-yellow-400"
                }
              />
            </button>
            <button
              onClick={() => setEditingPersona(p)}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              <Edit size={18} />
            </button>
            <button
              onClick={() => handleDeletePersona(p.id, p.name)}
              className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition hover:bg-red-500/10 rounded-lg"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {(!userPersonas || userPersonas.length === 0) && (
          <div className="text-center py-12 text-gray-600 border-2 border-dashed border-gray-800 rounded-2xl">
            <UserCircle size={48} className="mx-auto mb-3 opacity-20" />
            <p>No personas created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
