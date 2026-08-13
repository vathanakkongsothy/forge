import type { Metadata } from "next";
import { DownloadPage } from "../site";

export const metadata: Metadata = { title: "Download", description: "Download the latest Forge desktop beta." };
export default function Page() { return <DownloadPage />; }
