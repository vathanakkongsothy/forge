import type { Metadata } from "next";
import { LegalPage } from "../site";

export const metadata: Metadata = { title: "Privacy", description: "Forge beta privacy policy." };
export default function Page() { return <LegalPage kind="privacy" />; }
