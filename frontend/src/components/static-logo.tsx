"use client";

import { useEffect, useState } from "react";

interface StaticLogoProps {
  src: string;
  alt: string;
  className?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function freezeSvg(text: string): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") return text;
  if (doc.querySelector("parsererror")) return text;

  doc.querySelectorAll("script").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    }
  });

  const ANIM_SELECTOR = "animate, animateTransform, animateMotion, set";
  const animatedRevealIds = new Set<string>();
  doc.querySelectorAll("clipPath, mask").forEach((reveal) => {
    if (reveal.querySelector(ANIM_SELECTOR)) {
      const id = reveal.getAttribute("id");
      if (id) animatedRevealIds.add(id);
    }
  });
  if (animatedRevealIds.size > 0) {
    const urlRef = /url\(\s*#([^)\s]+)\s*\)/;
    doc.querySelectorAll("[clip-path], [mask]").forEach((el) => {
      const cpId = el.getAttribute("clip-path")?.match(urlRef)?.[1];
      const mkId = el.getAttribute("mask")?.match(urlRef)?.[1];
      if (cpId && animatedRevealIds.has(cpId)) el.removeAttribute("clip-path");
      if (mkId && animatedRevealIds.has(mkId)) el.removeAttribute("mask");
    });
  }

  doc.querySelectorAll(ANIM_SELECTOR).forEach((el) => el.remove());

  const style = doc.createElementNS(SVG_NS, "style");
  style.textContent = "*{animation:none !important;transition:none !important;}";
  svg.insertBefore(style, svg.firstChild);

  svg.removeAttribute("width");
  svg.removeAttribute("height");
  const existingStyle = svg.getAttribute("style") ?? "";
  svg.setAttribute("style", `${existingStyle};height:100%;width:auto;display:block`);

  return new XMLSerializer().serializeToString(svg);
}

export function StaticLogo({ src, alt, className }: StaticLogoProps) {
  const [markup, setMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isSvg = /\.svg(\?|$)/i.test(src);

  useEffect(() => {
    if (!isSvg) return;
    let cancelled = false;
    setMarkup(null);
    setFailed(false);
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        if (!cancelled) setMarkup(freezeSvg(text));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, isSvg]);

  if (!isSvg || failed) {
    return <img src={src} alt={alt} className={className} />;
  }

  if (!markup) {
    return <div className={className} role="img" aria-label={alt} />;
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={alt}
      style={{ display: "inline-flex", alignItems: "center" }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
