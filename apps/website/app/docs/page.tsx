import type { Metadata } from "next";
import { DocsPage } from "../site";

export const metadata: Metadata = { title: "Documentation", description: "Get started with Forge." };
export default function Page() { return <DocsPage />; }
