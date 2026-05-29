import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useTranslation } from 'react-i18next'

export type ToastType = "success" | "error" | "info";

export type ToastMessage = {
  id: string;
  message: string;
  type: ToastType;
};

const Toast = ({ toast, onClose }: { toast: ToastMessage; onClose: (id: string) => void }) => {
  const { t } = useTranslation()
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const bgColors = {
    success: t('bgemerald600BorderBorderemerald500', 'bg-emerald-600 border border-emerald-500'),
    error: t('bgred600BorderBorderred500', 'bg-red-600 border border-red-500'),
    info: t('bgindigo600BorderBorderindigo500', 'bg-indigo-600 border border-indigo-500'),
  };

  const icons = {
    success: <CheckCircle size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <div 
        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-2xl ${bgColors[toast.type]} animate-in slide-in-from-top-2 duration-300 pointer-events-auto min-w-[280px] max-w-sm backdrop-blur-md bg-opacity-90 cursor-default`}
    >
      <div className="shrink-0">{icons[toast.type]}</div>
      <span className="flex-1 text-sm font-medium leading-tight select-text">{toast.message}</span>
      <button onClick={(e) => { e.stopPropagation(); onClose(toast.id); }} className="hover:bg-white/20 p-1 rounded-full transition shrink-0 cursor-pointer">
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer = ({ toasts, onClose }: { toasts: ToastMessage[]; onClose: (id: string) => void }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none p-4 md:p-0 w-full md:w-auto items-center md:items-end">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
};
