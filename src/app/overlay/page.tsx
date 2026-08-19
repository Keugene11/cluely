import { getUser } from "@/lib/auth";
import { Overlay } from "@/components/overlay";
import { OverlayLogin } from "@/components/overlay-login";

/** The surface the Electron window loads. Sized for a 440px always-on-top panel. */
export default async function OverlayPage() {
  const user = await getUser();

  return (
    <div className="overlay-root">
      {user ? <Overlay /> : <OverlayLogin />}
    </div>
  );
}
