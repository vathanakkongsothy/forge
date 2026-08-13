import type { Metadata } from "next";
import { LegalPage } from "../site";

export const metadata: Metadata = { title: "Terms", description: "Forge beta terms of use." };
export default function Page() { return <LegalPage kind="terms" />; }
