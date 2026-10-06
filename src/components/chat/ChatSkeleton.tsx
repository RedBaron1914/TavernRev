import React from "react";

interface ChatSkeletonProps {
  chatStyle?: "bubbles" | "document";
}

export const ChatSkeleton: React.FC<ChatSkeletonProps> = ({ chatStyle = "bubbles" }) => {
  if (chatStyle === "document") {
    return (
      <div className="space-y-8 p-4 max-w-4xl mx-auto animate-in fade-in duration-300">
        {/* Document Section 1 (Bot / Narrative) */}
        <div className="space-y-3 p-5 rounded-2xl bg-gray-900/30 border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <div className="w-9 h-9 rounded-full skeleton-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="w-28 h-3.5 rounded-md skeleton-shimmer" />
              <div className="w-16 h-2.5 rounded skeleton-shimmer opacity-60" />
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="w-full h-3.5 rounded skeleton-shimmer" />
            <div className="w-[96%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[88%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[72%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Document Section 2 (User) */}
        <div className="space-y-3 p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/10 backdrop-blur-sm">
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <div className="w-9 h-9 rounded-full skeleton-shimmer shrink-0 bg-indigo-500/20" />
            <div className="space-y-1.5 flex-1">
              <div className="w-20 h-3.5 rounded-md skeleton-shimmer" />
              <div className="w-14 h-2.5 rounded skeleton-shimmer opacity-60" />
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="w-[94%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[60%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Document Section 3 (Bot continuation) */}
        <div className="space-y-3 p-5 rounded-2xl bg-gray-900/30 border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <div className="w-9 h-9 rounded-full skeleton-shimmer shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="w-28 h-3.5 rounded-md skeleton-shimmer" />
              <div className="w-16 h-2.5 rounded skeleton-shimmer opacity-60" />
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="w-full h-3.5 rounded skeleton-shimmer" />
            <div className="w-[92%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[78%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[45%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 sm:p-4 max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* 1. Bot Message (Left) */}
      <div className="flex items-start gap-3 justify-start">
        <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0 border border-white/10 shadow-sm" />
        <div className="space-y-1.5 max-w-[85%] sm:max-w-[75%] w-full">
          <div className="w-24 h-3 rounded skeleton-shimmer opacity-70 ml-1" />
          <div className="p-4 rounded-2xl rounded-tl-sm bg-gray-900/50 border border-white/5 space-y-2.5 shadow-lg backdrop-blur-sm">
            <div className="w-[95%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[88%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[65%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* 2. User Message (Right) */}
      <div className="flex items-start gap-3 justify-end">
        <div className="space-y-1.5 max-w-[80%] sm:max-w-[65%] w-full flex flex-col items-end">
          <div className="w-16 h-3 rounded skeleton-shimmer opacity-70 mr-1" />
          <div className="p-4 rounded-2xl rounded-tr-sm bg-indigo-950/40 border border-indigo-500/15 space-y-2.5 shadow-lg backdrop-blur-sm w-full">
            <div className="w-[90%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[55%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0 border border-indigo-500/20 shadow-sm" />
      </div>

      {/* 3. Bot Message with Image Attachment (Left) */}
      <div className="flex items-start gap-3 justify-start">
        <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0 border border-white/10 shadow-sm" />
        <div className="space-y-1.5 max-w-[85%] sm:max-w-[75%] w-full">
          <div className="w-24 h-3 rounded skeleton-shimmer opacity-70 ml-1" />
          <div className="p-4 rounded-2xl rounded-tl-sm bg-gray-900/50 border border-white/5 space-y-3 shadow-lg backdrop-blur-sm">
            <div className="w-[80%] h-3.5 rounded skeleton-shimmer" />
            {/* Image Placeholder */}
            <div className="w-full max-w-xs h-44 rounded-xl skeleton-shimmer border border-white/10 flex items-center justify-center">
              <div className="w-8 h-8 rounded-lg skeleton-shimmer opacity-40" />
            </div>
            <div className="w-[50%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* 4. User Short Message (Right) */}
      <div className="flex items-start gap-3 justify-end">
        <div className="space-y-1.5 max-w-[70%] sm:max-w-[50%] w-full flex flex-col items-end">
          <div className="w-14 h-3 rounded skeleton-shimmer opacity-70 mr-1" />
          <div className="p-3.5 rounded-2xl rounded-tr-sm bg-indigo-950/40 border border-indigo-500/15 shadow-lg backdrop-blur-sm w-full">
            <div className="w-[85%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0 border border-indigo-500/20 shadow-sm" />
      </div>

      {/* 5. Bot Detailed Response (Left) */}
      <div className="flex items-start gap-3 justify-start">
        <div className="w-10 h-10 rounded-full skeleton-shimmer shrink-0 border border-white/10 shadow-sm" />
        <div className="space-y-1.5 max-w-[90%] sm:max-w-[80%] w-full">
          <div className="w-24 h-3 rounded skeleton-shimmer opacity-70 ml-1" />
          <div className="p-4 rounded-2xl rounded-tl-sm bg-gray-900/50 border border-white/5 space-y-2.5 shadow-lg backdrop-blur-sm">
            <div className="w-full h-3.5 rounded skeleton-shimmer" />
            <div className="w-[92%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[85%] h-3.5 rounded skeleton-shimmer" />
            <div className="w-[60%] h-3.5 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
};
