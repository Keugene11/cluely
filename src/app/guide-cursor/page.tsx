import { GuideCursor } from "@/components/guide-cursor";

/** The transparent full-screen window Electron loads for the guiding cursor. */
export default function GuideCursorPage() {
  return (
    <div className="guide-cursor-root">
      <GuideCursor />
    </div>
  );
}
