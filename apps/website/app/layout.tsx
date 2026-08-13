import type { Metadata } from "next";
import "./globals.css";

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
  return <html lang="en"><body>{children}</body></html>;
}
