/** The API `electron/preload.js` puts on `window` when running in the desktop shell. */
export type DesktopState = {
  contentProtection: boolean;
  clickThrough: boolean;
  visible: boolean;
  platform: string;
};

export type DesktopBridge = {
  isDesktop: true;
  getState: () => Promise<DesktopState>;
  captureScreen: () => Promise<string | null>;
  setContentProtection: (enabled: boolean) => Promise<boolean>;
  setClickThrough: (enabled: boolean) => Promise<boolean>;
  hide: () => Promise<void>;
  quit: () => Promise<void>;
  onAssist: (callback: () => void) => () => void;
  onState: (callback: (state: DesktopState) => void) => () => void;
};

/** Returns the bridge, or null when running as a normal web page. */
export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { cluely?: DesktopBridge }).cluely ?? null;
}
