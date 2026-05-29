import { Plus, Edit, Trash2 } from "lucide-react";
import { QuickReply } from "../../types";
import { useTranslation } from 'react-i18next'

interface QuickRepliesTabProps {
  quickReplies: QuickReply[];
  handleCreateQR: () => void;
  setEditingQR: (qr: QuickReply | null) => void;
  handleDeleteQR: (id: number) => void;
}

export function QuickRepliesTab({
  quickReplies,
  handleCreateQR,
  setEditingQR,
  handleDeleteQR,
}: QuickRepliesTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white">{t('quickReplies', 'Quick Replies')}</h3>
          <p className="text-gray-400 text-sm">
            {t('buttonsForQuickActionsOrCommands', 'Buttons for quick actions or commands.')}
          </p>
        </div>
        <button
          onClick={handleCreateQR}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
        >
          <Plus size={16} /> {t('newQr', 'New QR')}
        </button>
      </div>

      <div className="space-y-3">
        {quickReplies.map((qr) => (
          <div
            key={qr.id}
            className="bg-gray-900 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-xl">
                {qr.icon || "⚡"}
              </div>
              <div>
                <h3 className="font-bold text-gray-200">{qr.label}</h3>
                <code className="text-xs text-gray-500 font-mono">
                  {qr.content}
                </code>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditingQR(qr)}
                className="p-2 text-gray-500 hover:text-white transition bg-gray-800 rounded-lg"
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => handleDeleteQR(qr.id)}
                className="p-2 text-gray-500 hover:text-red-400 transition bg-gray-800 rounded-lg"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {quickReplies.length === 0 && (
          <div className="text-center py-12 text-gray-600 italic border border-dashed border-white/10 rounded-xl">
            {t('noQuickRepliesCreated', 'No Quick Replies created.')}
          </div>
        )}
      </div>
    </div>
  );
}
