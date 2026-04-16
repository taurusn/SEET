"use client";

import { useEffect, useState } from "react";

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
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 50);
    const t2 = setTimeout(() => setPhase("exit"), 2200);
    const t3 = setTimeout(() => onDone(), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDone]);

  const color = brandColor || "#115e59";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${color} 0%, ${color} 50%, ${color}e6 100%)`,
        opacity: phase === "exit" ? 0 : 1,
        transform: phase === "exit" ? "translateY(-8px)" : "translateY(0)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {/* Ambient glow circles */}
      <div
        className="absolute splash-glow-1"
        style={{ background: `${color}66` }}
      />
      <div
        className="absolute splash-glow-2"
        style={{ background: `${color}44` }}
      />

      {/* Logo container */}
      <div
        className="relative"
        style={{
          opacity: phase === "enter" ? 0 : 1,
          transform: phase === "enter" ? "scale(0.8)" : "scale(1)",
          transition: "opacity 0.5s cubic-bezier(0.34,1.56,0.64,1), transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Glow ring behind logo */}
        <div className="absolute inset-0 splash-ring" style={{ borderColor: "rgba(255,255,255,0.2)" }} />

        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className="w-24 h-24 object-contain rounded-2xl relative z-10"
          />
        ) : (
          <img
            src="/seet-mark-animated.svg"
            alt="SEET"
            width={160}
            height={160}
            className="w-28 h-28 relative z-10"
          />
        )}
      </div>

      {/* Splash text */}
      {splashText && (
        <p
          className="text-white/80 text-base font-medium text-center max-w-xs mt-6"
          style={{
            opacity: phase === "enter" ? 0 : 1,
            transform: phase === "enter" ? "translateY(8px)" : "translateY(0)",
            transition: "opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s",
          }}
        >
          {splashText}
        </p>
      )}

      {/* Progress bar */}
      <div className="absolute bottom-12 w-32 h-0.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-white/50"
          style={{
            width: phase === "enter" ? "0%" : "100%",
            transition: "width 2s ease-in-out",
          }}
        />
      </div>
    </div>
  );
}
