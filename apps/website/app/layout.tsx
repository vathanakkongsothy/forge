import type { Metadata } from "next";
import "./globals.css";
import { PreferencesProvider } from "./preferences";

export const metadata: Metadata = {
  title: {
    default: "Forge — One AI desktop for your work",
    template: "%s · Forge",
  },
  description: "Bring your AI agents, browser, terminal, code, and Git into one focused desktop workspace.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Forge — One AI desktop for your work",
    description: "Ask. Code. Run. See. Inspect. Fix. Verify. Ship.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Forge desktop workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge — One AI desktop for your work",
    description: "Ask. Code. Run. See. Inspect. Fix. Verify. Ship.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(()=>{try{const t=localStorage.getItem('forge-theme');const l=localStorage.getItem('forge-language');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.lang=l==='km'?'km':'en'}catch{}})()` }} /></head><body><PreferencesProvider>{children}</PreferencesProvider></body></html>;
}
