"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface SplashScreenProps {
  logoUrl?: string;
  brandColor?: string;
  splashText?: string;
  onDone: () => void;
}

export function SplashScreen({
  logoUrl,
  brandColor,
  splashText,
  onDone,
}: SplashScreenProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1600);
    const doneTimer = setTimeout(() => onDone(), 2000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-400"
      style={{
        opacity: fading ? 0 : 1,
        backgroundColor: brandColor || "var(--primary)",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className="w-28 h-28 object-contain rounded-2xl"
          />
        ) : (
          <Image
            src="/seet-logo.png"
            alt="SEET"
            width={160}
            height={160}
            className="w-32 invert"
            priority
          />
        )}
        {splashText && (
          <p className="text-white/90 text-lg font-medium text-center max-w-xs">
            {splashText}
          </p>
        )}
      </div>
    </div>
  );
}
