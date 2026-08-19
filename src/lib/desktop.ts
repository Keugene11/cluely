/** The API `electron/preload.js` puts on `window` when running in the desktop shell. */
export type DesktopState = {
  contentProtection: boolean;
  clickThrough: boolean;
  visible: boolean;
  platform: string;
};

export type UpdateState = {
  status: "idle" | "checking" | "downloading" | "ready";
  version: string | null;
  progress: number;
};

export type DesktopBridge = {
  isDesktop: true;
  getState: () => Promise<DesktopState>;
  captureScreen: () => Promise<string | null>;
  resize: (height: number) => Promise<void>;
  open: (target: string) => Promise<{ ok: boolean; message: string }>;
  point: (target: { x: number; y: number; label: string }) => Promise<void>;
  clearPoint: () => Promise<void>;
  /** Fly the cursor to a normalized point and press it for real. */
  click: (target: { x: number; y: number; label: string }) => Promise<{ ok: boolean; message: string }>;
  onPointTo: (
    callback: (target: { x: number; y: number; label: string } | null) => void,
  ) => () => void;
  /** Cursor window only: the moment a real click fires, for the press animation. */
  onPress?: (callback: () => void) => () => void;
  onVoiceGuide: (callback: () => void) => () => void;
  setContentProtection: (enabled: boolean) => Promise<boolean>;
  hide: () => Promise<void>;
  quit: () => Promise<void>;
  getUpdateState: () => Promise<UpdateState>;
  installUpdate: () => Promise<void>;
  onUpdate: (callback: (state: UpdateState) => void) => () => void;
  onAssist: (callback: () => void) => () => void;
  onState: (callback: (state: DesktopState) => void) => () => void;
};

/** Returns the bridge, or null when running as a normal web page. */
export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { cluely?: DesktopBridge }).cluely ?? null;
}
