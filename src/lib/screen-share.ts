"use client";

/**
 * Reading the screen from a browser tab, for the public demo.
 *
 * The desktop app screenshots the whole display through Electron with nothing
 * asked of the user. A web page cannot do that, and should not be able to — so
 * the demo asks instead: the visitor picks a window or a tab in the browser's
 * own picker, and from then on Otto sees exactly what they chose and nothing
 * else. That is the honest version of the feature, and it is the same
 * screenshot-then-answer loop the real product runs.
 *
 * The stream is kept open between questions rather than re-prompting for each
 * one — being asked to pick a window every single time is not a demo anyone
 * finishes.
 */

/** Longest edge of the screenshot sent to Claude. */
const MAX_EDGE = 1400;

/** JPEG rather than PNG: a screenshot of text is large, and this is a POST. */
const QUALITY = 0.72;

export type ScreenShare = {
  /** Ask for a window/tab and start watching it. Resolves false if declined. */
  start: () => Promise<boolean>;
  /** A frame as a data URL, or null when nothing is being shared. */
  capture: () => Promise<string | null>;
  stop: () => void;
  active: () => boolean;
  /** Called when the share ends — including from the browser's own "Stop sharing". */
  onEnd: (fn: () => void) => void;
};

export function supportsScreenShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

export function createScreenShare(): ScreenShare {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let ended: (() => void) | null = null;

  const teardown = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video?.remove();
    video = null;
  };

  return {
    active: () => stream !== null,

    onEnd(fn) {
      ended = fn;
    },

    async start() {
      if (stream) return true;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          // One frame per second is all a screenshot-per-question needs, and it
          // keeps the capture cheap on the visitor's machine.
          video: { frameRate: 1 },
          audio: false,
        });
      } catch {
        return false; // dismissed the picker, or the browser refused
      }

      // Ending the share from the browser's own bar has to reach the UI, or the
      // button keeps claiming Otto can see a screen that is no longer shared.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        teardown();
        ended?.();
      });

      const el = document.createElement("video");
      el.srcObject = stream;
      el.muted = true;
      el.playsInline = true;
      // Off-screen rather than display:none — a hidden video element is allowed
      // to stop producing frames, and then every capture comes back blank.
      el.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;";
      document.body.appendChild(el);
      video = el;

      await el.play().catch(() => {});
      // The first frame is not necessarily ready when play() resolves.
      if (!el.videoWidth) {
        await new Promise<void>((resolve) => {
          el.addEventListener("loadedmetadata", () => resolve(), { once: true });
          setTimeout(resolve, 1500);
        });
      }
      return true;
    },

    async capture() {
      if (!video || !video.videoWidth) return null;

      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        return canvas.toDataURL("image/jpeg", QUALITY);
      } catch {
        return null; // tainted canvas; nothing useful to send
      }
    },

    stop() {
      teardown();
    },
  };
}
