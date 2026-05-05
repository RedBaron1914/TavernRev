import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { User, Bot, X } from "lucide-react";

const Avatar = ({
  src,
  name,
  size = "md",
  type = "char",
  zoomable = false,
}: {
  src: string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  type?: "user" | "char";
  zoomable?: boolean;
}) => {
  const [imgData, setImgData] = useState<string | null>(null);
  const [showZoom, setShowZoom] = useState(false);

  useEffect(() => {
    let active = true;
    if (src && src !== "default.png" && src !== "user_default.png") {
      const loadAvatar = async () => {
        try {
          const appDataPath = await appLocalDataDir();
          const avatarPath = await join(appDataPath, "avatars", src);
          const assetUrl = convertFileSrc(avatarPath);
          if (active) setImgData(assetUrl);
        } catch (e) {
          console.error("Avatar path resolution error:", e);
        }
      };
      loadAvatar();
    } else {
        setImgData(null);
    }
    return () => {
      active = false;
    };
  }, [src]);

  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };
  const roundClasses = (size === "sm" || size === "xs") ? "rounded-lg" : "rounded-2xl";

  const handleClick = (e: React.MouseEvent) => {
    if (zoomable && imgData) {
      e.stopPropagation();
      setShowZoom(true);
    }
  };

  return (
    <>
      {imgData ? (
        <img
          src={imgData}
          alt={name}
          onClick={handleClick}
          className={`${sizeClasses[size]} ${roundClasses} object-cover border border-white/10 shrink-0 ${zoomable ? "cursor-pointer hover:opacity-90 transition" : ""}`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} ${roundClasses} bg-gray-800 flex items-center justify-center border border-white/10 text-gray-400 shrink-0`}
        >
          {type === "user" ? (
            <User size={(size === "sm" || size === "xs") ? 14 : 20} />
          ) : (
            <Bot size={(size === "sm" || size === "xs") ? 14 : 20} />
          )}
        </div>
      )}

      {showZoom && imgData && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowZoom(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={imgData}
              alt={name}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setShowZoom(false)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300"
            >
              <X size={32} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Avatar;
