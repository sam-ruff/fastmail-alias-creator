import { useEffect, useState } from "preact/hooks";
import type { Status } from "../shared/messages";
import { errorMessage, useBridge } from "../ui/bridge";
import { SignIn } from "../ui/SignIn";

export function Options() {
  const bridge = useBridge();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    bridge
      .send("getStatus", {})
      .then(setStatus, (err) => setMessage({ text: errorMessage(err), error: true }));
  }, [bridge]);

  const run = async (action: () => Promise<Status>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await action());
      setMessage({ text: done, error: false });
    } catch (err) {
      setMessage({ text: errorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="options">
      <h1>Fastmail Alias Creator</h1>

      <section class="card">
        <h2>Account</h2>
        {!status && !message && <p class="empty">Loading...</p>}
        {status && !status.auth.signedIn && (
          <SignIn oauthAvailable={status.oauthAvailable} onSignedIn={setStatus} />
        )}
        {status?.auth.signedIn && (
          <>
            <p>
              Connected with {status.auth.method === "oauth" ? "Fastmail sign in" : "an API token"}.
            </p>
            <p class="hint">
              {status.lastSyncedAt
                ? `Aliases last synced ${new Date(status.lastSyncedAt).toLocaleString("en-GB")}.`
                : "Aliases have not been synced yet."}
            </p>
            <div class="button-row">
              <button
                class="btn"
                disabled={busy}
                onClick={() =>
                  void run(() => bridge.send("sync", { force: true }), "Aliases synced.")
                }
              >
                Sync now
              </button>
              <button
                class="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => bridge.send("signOut", {}),
                    "Signed out and local history cleared.",
                  )
                }
              >
                Sign out
              </button>
            </div>
          </>
        )}
        {message && (
          <p class={message.error ? "error" : "success"} role="status">
            {message.text}
          </p>
        )}
      </section>

      <section class="card">
        <h2>How history works</h2>
        <p class="hint">
          Each alias records the website it was created for in Fastmail itself, so aliases made on
          other devices or by other apps show up too. A copy is cached in this browser for quick
          searching and is removed when you sign out.
        </p>
      </section>
    </main>
  );
}
