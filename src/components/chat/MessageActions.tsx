import {
  Play,
  RefreshCw,
  GitBranch,
  Pencil,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { Message } from "../../types";

export interface MessageActionsProps {
  message: Message;
  isUser: boolean;
  isFirst: boolean;
  variant: "document" | "bubbles";
  isMobile: boolean;
  activeMessageId: number | null;
  onContinue: (id: number) => void;
  onRegenerate: (id: number) => void;
  onBranch: (id: number) => void;
  onEdit: (msg: Message) => void;
  onToggleExclude: (id: number, excluded: boolean) => void;
  onDelete: (id: number) => void;
  showGenerationActions?: boolean;
  isGenerating?: boolean;
}

export function MessageActions({
  message,
  isUser,
  isFirst,
  variant,
  isMobile,
  activeMessageId,
  onContinue,
  onRegenerate,
  onBranch,
  onEdit,
  onToggleExclude,
  onDelete,
  showGenerationActions = false,
  isGenerating = false,
}: MessageActionsProps) {
  const excluded = !!message.extra?.exclude_from_prompt;

  if (variant === "document") {
    return (
      <div
        className={`flex gap-1 transition-opacity ${
          isMobile
            ? activeMessageId === message.id
              ? "opacity-100"
              : "opacity-0 pointer-events-none"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {!isUser && showGenerationActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContinue(message.id);
            }}
            className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5 text-[10px]"
            title="Continue"
          >
            <Play size={12} />
            <span>Continue</span>
          </button>
        )}
        {!isUser && showGenerationActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(message.id);
            }}
            className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5 text-[10px]"
            title="Regenerate"
          >
            <RefreshCw size={12} className={isGenerating ? "animate-spin" : ""} />
            <span>Regen</span>
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBranch(message.id);
          }}
          className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5 text-[10px]"
          title="Branch"
        >
          <GitBranch size={12} />
          <span>Branch</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(message);
          }}
          className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-white rounded hover:bg-white/5 text-[10px]"
          title="Edit"
        >
          <Pencil size={12} />
          <span>Edit</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExclude(message.id, excluded);
          }}
          className={`flex items-center gap-1 p-1.5 rounded hover:bg-white/5 text-[10px] ${
            excluded
              ? "text-amber-400"
              : "text-gray-500 hover:text-white"
          }`}
          title={excluded ? "Include in prompt" : "Exclude from prompt"}
        >
          {excluded ? <Eye size={12} /> : <EyeOff size={12} />}
          <span>{excluded ? "Show" : "Hide"}</span>
        </button>
        {!isFirst && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(message.id);
            }}
            className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 text-[10px]"
            title="Delete"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="absolute -top-3 right-0 md:opacity-0 group-hover:opacity-100 opacity-100 flex gap-1 bg-gray-900/80 rounded-lg p-0.5 border border-white/10 backdrop-blur transition-opacity">
      <button
        onClick={() => onBranch(message.id)}
        className="flex items-center gap-1 p-1 text-gray-400 hover:text-white text-[10px]"
        title="Branch Chat"
      >
        <GitBranch size={12} />
        <span>Branch</span>
      </button>
      <button
        onClick={() => onEdit(message)}
        className="flex items-center gap-1 p-1 text-gray-400 hover:text-white text-[10px]"
        title="Edit"
      >
        <Pencil size={12} />
        <span>Edit</span>
      </button>
      <button
        onClick={() => onToggleExclude(message.id, excluded)}
        className={`flex items-center gap-1 p-1 text-[10px] ${
          excluded
            ? "text-amber-400"
            : "text-gray-400 hover:text-white"
        }`}
        title={excluded ? "Include in prompt" : "Exclude from prompt"}
      >
        {excluded ? <Eye size={12} /> : <EyeOff size={12} />}
        <span>{excluded ? "Show" : "Hide"}</span>
      </button>
      {!isFirst && (
        <button
          onClick={() => onDelete(message.id)}
          className="flex items-center gap-1 p-1 text-gray-400 hover:text-red-400 text-[10px]"
          title="Delete"
        >
          <Trash2 size={12} />
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}
