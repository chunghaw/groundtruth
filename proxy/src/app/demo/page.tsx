import type { Metadata } from "next";
import { isMock } from "@/lib/microburbs";
import { DemoClient } from "./DemoClient";
import "./demo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Groundtruth demo", description: "Try the Groundtruth panel on a fictional listing page." };

export default function DemoPage() {
  return <DemoClient mock={isMock()} />;
}
