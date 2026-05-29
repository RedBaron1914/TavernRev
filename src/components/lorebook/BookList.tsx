import {
  Book, Trash2, Globe, User, MessageSquare, Pin, PinOff,
  RotateCcw, Power,
} from "lucide-react";
import type { Lorebook, LorebookLink, LoreTab } from "./types";
import { useTranslation } from 'react-i18next'

interface BookListProps {
  books: Lorebook[];
  chatLinks: LorebookLink[];
  charLinks: LorebookLink[];
  activeTab: LoreTab;
  activeBookId: number | null;
  onSelectBook: (id: number) => void;
  onToggleEnabled: (bookId: number, target: LoreTab) => void;
  onUnpin: (bookId: number, target: "card" | "chat") => void;
  onPin: (bookId: number, bookName: string) => void;
  onReturnToGlobal: (bookId: number) => void;
  onDelete: (id: number) => void;
  isBookEnabled: (bookId: number, tab: LoreTab) => boolean;
}

export function BookList({
  books, chatLinks, charLinks, activeTab, activeBookId,
  onSelectBook, onToggleEnabled, onUnpin, onPin, onReturnToGlobal, onDelete,
  isBookEnabled,
}: BookListProps) {
  const { t } = useTranslation()
  if (books.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600 text-xs">{t('noActivetabLorebooks', 'No {{activeTab}} lorebooks', { activeTab })}</div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {books.map(book => {
        const isActive = activeBookId === book.id;
        const linkType = activeTab === "card" ? "card" : activeTab === "chat" ? "chat" : undefined;
        const bookEnabled = isBookEnabled(book.id, activeTab);
        return (
          <div key={book.id}
            className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition border ${
              !bookEnabled ? "opacity-50" : ""
            } ${
              isActive
                ? "bg-indigo-600/20 border-indigo-500/40"
                : "bg-gray-900/50 border-white/5 hover:bg-white/5 hover:border-white/10"
            }`}
            onClick={() => onSelectBook(book.id)}>
            <Book size={14} className={`shrink-0 ${isActive ? "text-indigo-400" : "text-gray-500"}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium truncate ${isActive ? "text-white" : "text-gray-300"}`}>
                {book.name}
              </div>
              <div className="flex gap-1 items-center">
                {book.is_global && <Globe size={9} className="text-cyan-400" />}
                {book.excluded_from_global && <span className="text-[8px] text-amber-400 font-bold">{t('excl', 'EXCL')}</span>}
                {charLinks.some(l => l.book_id === book.id) && <User size={9} className="text-pink-400" />}
                {chatLinks.some(l => l.book_id === book.id) && <MessageSquare size={9} className="text-indigo-400" />}
                {!bookEnabled && <span className="text-[8px] text-red-400 font-bold">OFF</span>}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => onToggleEnabled(book.id, activeTab)}
                className={`p-1 rounded transition ${
                  bookEnabled ? "text-emerald-400 hover:text-red-400" : "text-gray-600 hover:text-emerald-400"
                }`} title={bookEnabled ? t('disableAtThisLevel', 'Disable at this level') : t('enableAtThisLevel', 'Enable at this level')}>
                <Power size={14} />
              </button>
              {linkType === "chat" && (
                <button onClick={() => onUnpin(book.id, "chat")}
                  className="p-1.5 text-indigo-400 hover:text-red-400 rounded transition" title={t('unlinkFromChat', 'Unlink from chat')}>
                  <PinOff size={14} />
                </button>
              )}
              {linkType === "card" && (
                <button onClick={() => onUnpin(book.id, "card")}
                  className="p-1.5 text-pink-400 hover:text-red-400 rounded transition" title={t('unlinkFromCharacter', 'Unlink from character')}>
                  <PinOff size={14} />
                </button>
              )}
              {!linkType && (
                <>
                  <button onClick={() => onPin(book.id, book.name)}
                    className="p-1.5 text-gray-600 hover:text-indigo-400 rounded transition" title={t('linkToCharacter', 'Link to character')}>
                    <Pin size={14} />
                  </button>
                  {book.excluded_from_global && (
                    <button onClick={() => onReturnToGlobal(book.id)}
                      className="p-1.5 text-amber-400 hover:text-emerald-400 rounded transition" title={t('returnToGlobalPool', 'Return to global pool')}>
                      <RotateCcw size={14} />
                    </button>
                  )}
                </>
              )}
              {(linkType === "card" || linkType === "chat") && book.excluded_from_global && (
                <button onClick={() => onReturnToGlobal(book.id)}
                  className="p-1.5 text-amber-400 hover:text-emerald-400 rounded transition" title={t('returnToGlobalPool', 'Return to global pool')}>
                  <RotateCcw size={14} />
                </button>
              )}
              <button onClick={() => onDelete(book.id)}
                className="p-1.5 text-gray-600 hover:text-red-400 rounded transition opacity-0 group-hover:opacity-100" title={t('delete', 'Delete')}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
