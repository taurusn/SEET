// Theme palette generator — derives a full color palette from a single hex color.
// Uses HSL color space + WCAG contrast ratio for accessibility.

const SEET_FALLBACK = "#115e59";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
  else h = ((rn - gn) / delta + 4) * 60;

  return { h: h % 360, s: s * 100, l: l * 100 };
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): [number, number, number] {
  const sn = s / 100,
    ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// WCAG relative luminance
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(...hexToRgb(hex1));
  const l2 = luminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface ThemePalette {
  [key: string]: string;
}

export function generateTheme(hex?: string | null): ThemePalette {
  const input = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : SEET_FALLBACK;
  const [r, g, b] = hexToRgb(input);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Edge case: very low saturation — use as neutral gray, keep hue at 0
  const isGray = s < 8;
  const hue = isGray ? 0 : h;
  const sat = isGray ? 0 : s;

  // Primary: ensure white text has WCAG AA contrast (4.5:1)
  let primaryL = l;
  let primaryHex = hslToHex(hue, sat, primaryL);
  let useWhiteFg = contrastRatio(primaryHex, "#ffffff") >= 4.5;

  if (!useWhiteFg) {
    // Try darkening until white text works
    for (let tryL = primaryL - 1; tryL >= 10; tryL--) {
      const tryHex = hslToHex(hue, sat, tryL);
      if (contrastRatio(tryHex, "#ffffff") >= 4.5) {
        primaryL = tryL;
        primaryHex = tryHex;
        useWhiteFg = true;
        break;
      }
    }
    // If we still can't get white-on-primary (e.g., bright yellow),
    // use dark foreground on the original color
    if (!useWhiteFg) {
      primaryL = l;
      primaryHex = hslToHex(hue, sat, primaryL);
    }
  }

  const primaryFg = useWhiteFg ? "#ffffff" : "#0f172a";

  // Derived colors
  const accentL = clamp(primaryL + 28, 45, 72);
  const accentS = clamp(sat + 10, isGray ? 0 : 40, 95);
  const accent = hslToHex(hue, accentS, accentL);

  const accentFgL = clamp(primaryL - 8, 15, 35);
  const accentFgS = clamp(sat - 10, isGray ? 0 : 30, 80);
  const accentFg = hslToHex(hue, accentFgS, accentFgL);

  const mutedS = clamp(sat - 30, isGray ? 0 : 8, 40);
  const muted = hslToHex(hue, mutedS, 92);

  const sidebarS = clamp(sat + 5, isGray ? 0 : 40, 85);
  const sidebar = hslToHex(hue, sidebarS, 10);
  const [sR, sG, sB] = hslToRgb(hue, sidebarS, 10);

  const sidebarFgS = clamp(sat - 20, isGray ? 0 : 15, 60);
  const sidebarFg = hslToHex(hue, sidebarFgS, 92);

  const bgS = clamp(sat - 55, isGray ? 0 : 3, 15);
  const background = hslToHex(hue, bgS, 97);

  const borderS = clamp(sat - 55, isGray ? 0 : 3, 15);
  const border = hslToHex(hue, borderS, 89);

  const [pR, pG, pB] = hexToRgb(primaryHex);

  return {
    "--primary": primaryHex,
    "--primary-foreground": primaryFg,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--muted": muted,
    "--muted-foreground": "#64748b",
    "--sidebar": sidebar,
    "--sidebar-foreground": sidebarFg,
    "--sidebar-active": primaryHex,
    "--background": background,
    "--card": "#ffffff",
    "--card-foreground": "#0f172a",
    "--foreground": "#0f172a",
    "--border": border,
    "--success": "#16a34a",
    "--warning": "#d97706",
    "--danger": "#dc2626",
    // RGB triplets for rgba() usage in CSS
    "--sidebar-rgb": `${sR}, ${sG}, ${sB}`,
    "--primary-rgb": `${pR}, ${pG}, ${pB}`,
  };
}

export function applyTheme(palette: ThemePalette): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
}

export function clearTheme(): void {
  const root = document.documentElement;
  const keys = [
    "--primary",
    "--primary-foreground",
    "--accent",
    "--accent-foreground",
    "--muted",
    "--muted-foreground",
    "--sidebar",
    "--sidebar-foreground",
    "--sidebar-active",
    "--background",
    "--card",
    "--card-foreground",
    "--foreground",
    "--border",
    "--success",
    "--warning",
    "--danger",
    "--sidebar-rgb",
    "--primary-rgb",
  ];
  for (const key of keys) {
    root.style.removeProperty(key);
  }
}
