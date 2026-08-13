import type { Metadata } from "next";
import { ChangelogPage } from "../site";

export const metadata: Metadata = { title: "Changelog", description: "See what is new in Forge." };
export default function Page() { return <ChangelogPage />; }
