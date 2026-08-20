import type { Metadata } from "next";
import { DemoOtto } from "@/components/demo-otto";

export const metadata: Metadata = {
  title: "Otto — live demo",
  description: "Ask Otto anything, and let it read a window you share. No account.",
};

/**
 * The public demo. No auth, deliberately: a demo behind a signup form is a
 * signup form. It is embeddable in an iframe, which is what it exists for.
 */
export default function DemoPage() {
  return <DemoOtto />;
}
