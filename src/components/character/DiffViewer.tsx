import { diffWordsWithSpace } from 'diff';

export const DiffViewer = ({ oldText, newText }: { oldText: string; newText: string }) => {
  const diffResult = diffWordsWithSpace(oldText || "", newText || "");

  return (
    <div className="font-mono text-xs sm:text-sm bg-black/40 border border-gray-700/50 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600">
      {diffResult.map((part, index) => {
        if (part.added) {
          return (
            <span key={index} className="bg-green-500/30 text-green-200 rounded-sm px-0.5 font-medium">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={index} className="bg-red-500/30 text-red-300 line-through rounded-sm px-0.5 opacity-60">
              {part.value}
            </span>
          );
        }
        return (
          <span key={index} className="text-gray-300">
            {part.value}
          </span>
        );
      })}
    </div>
  );
};
