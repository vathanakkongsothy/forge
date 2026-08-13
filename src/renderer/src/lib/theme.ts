import type { ThemePreference } from "@forge/shared";

export const THEME_STORAGE_KEY = "forge-theme";

export function readStoredTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(preference: ThemePreference): "light" | "dark" {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  return resolved;
}

export function windowBackground(resolved: "light" | "dark"): string {
  return resolved === "light" ? "#f5f6f8" : "#0c0d10";
}
