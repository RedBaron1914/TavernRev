import {
  Send,
  MoreVertical,
  BookOpen,
  Zap,
  Download,
  Image,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { QuickReply } from "../../types";

interface MessageInputProps {
  quickReplies: QuickReply[];
  showQR: boolean;
  setShowQR: (v: boolean) => void;
  attachedImages: string[];
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  showInputMenu: boolean;
  setShowInputMenu: (v: boolean) => void;
  setShowMemoryModal: (v: boolean) => void;
  chatMemory: string;
  handleImpersonate: () => void;
  handleExportChat: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleSendMessage: (content?: string) => void;
  handleStop: () => void;
  isGenerating: boolean;
  isRetrying: boolean;
  activeChatId: number | null;
  activePersonaName: string;
  isMobile: boolean;
}

export function MessageInput({
  quickReplies,
  showQR,
  setShowQR,
  attachedImages,
  setAttachedImages,
  showInputMenu,
  setShowInputMenu,
  setShowMemoryModal,
  chatMemory,
  handleImpersonate,
  handleExportChat,
  fileInputRef,
  handleImageSelect,
  inputValue,
  setInputValue,
  handlePaste,
  handleSendMessage,
  handleStop,
  isGenerating,
  isRetrying,
  activeChatId,
  activePersonaName,
  isMobile,
}: MessageInputProps) {
  return (
    <>
      {showQR && quickReplies.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              onClick={() => handleSendMessage(qr.content)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition border border-white/5 flex items-center gap-2"
              title={qr.content}
            >
              {qr.icon && <span>{qr.icon}</span>}
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {attachedImages.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative group shrink-0">
              <img
                src={img}
                className="h-16 w-16 object-cover rounded-lg border border-white/10 shadow-sm"
              />
              <button
                onClick={() =>
                  setAttachedImages((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-lg opacity-80 hover:opacity-100 transition"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <footer className="p-3 bg-gray-900/80 border-t border-white/10 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-gray-800/50 p-2 rounded-2xl border border-white/5 focus-within:border-indigo-500/50 transition-all">
          <div className="relative mb-1 ml-1 shrink-0">
            <button
              onClick={() => setShowInputMenu(!showInputMenu)}
              className={`p-2 text-gray-500 hover:text-white transition rounded-lg hover:bg-white/5 ${
                showInputMenu ? "bg-white/10 text-white" : ""
              }`}
            >
              <MoreVertical size={20} />
            </button>
            {showInputMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowInputMenu(false)}
                />
                <div className="absolute bottom-full left-0 pb-2 w-48 z-50 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    <button
                      onClick={() => {
                        setShowMemoryModal(true);
                        setShowInputMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-600/20 flex gap-3 items-center text-gray-200 transition"
                    >
                      <BookOpen
                        size={16}
                        className={
                          chatMemory.trim() ? "text-amber-400" : "text-gray-400"
                        }
                      />
                      Chat Memory
                    </button>
                    <button
                      onClick={() => {
                        handleImpersonate();
                        setShowInputMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-600/20 flex gap-3 items-center text-gray-200 transition"
                    >
                      <Zap
                        size={16}
                        className="text-amber-400 fill-amber-400/20"
                      />{" "}
                      Impersonate Me
                    </button>
                    <button
                      onClick={() => {
                        handleExportChat();
                        setShowInputMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-600/20 flex gap-3 items-center text-gray-200 transition sm:hidden"
                    >
                      <Download size={16} className="text-blue-400" /> Download chat
                    </button>
                    <button
                      onClick={() => {
                        setShowQR(!showQR);
                        setShowInputMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-600/20 flex gap-3 items-center text-gray-200 transition"
                    >
                      <Zap
                        size={16}
                        className={showQR ? "text-indigo-400" : "text-gray-500"}
                      />
                      {showQR ? "Hide" : "Show"} Quick Replies
                    </button>
                    <button
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowInputMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-600/20 flex gap-3 items-center text-gray-200 transition"
                    >
                      <Image size={16} /> Attach Image
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={`Message as ${activePersonaName}...`}
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 px-2 py-2 focus:outline-none resize-none max-h-32 min-h-[40px] custom-scrollbar"
            disabled={activeChatId === null}
          />
          {isGenerating ? (
            <button
              onClick={handleStop}
              className={`p-2.5 text-white rounded-xl active:scale-95 transition shadow-lg ${
                isRetrying
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-500/20"
                  : "bg-red-600 hover:bg-red-500 shadow-red-500/20"
              }`}
              title={isRetrying ? "Cancel Retry" : "Stop Generation"}
            >
              {isRetrying ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Square size={18} fill="currentColor" />
              )}
            </button>
          ) : (
            <button
              onClick={() => handleSendMessage()}
              disabled={activeChatId === null}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 active:scale-95 transition disabled:opacity-50 shadow-lg shadow-indigo-500/20"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </footer>
    </>
  );
}
