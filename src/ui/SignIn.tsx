import { useState } from "preact/hooks";
import type { Status } from "../shared/messages";
import { errorMessage, useBridge } from "./bridge";

interface Props {
  oauthAvailable: boolean;
  onSignedIn: (status: Status) => void;
}

const TOKEN_HELP_URL = "https://app.fastmail.com/settings/security/tokens";

export function SignIn({ oauthAvailable, onSignedIn }: Props) {
  const bridge = useBridge();
  const [showToken, setShowToken] = useState(!oauthAvailable);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<Status>) => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitToken = (event: Event) => {
    event.preventDefault();
    void run(() => bridge.send("signInToken", { token }));
  };

  return (
    <div class="sign-in">
      <p class="lede">Connect your Fastmail account to create masked email aliases.</p>

      {oauthAvailable && (
        <button
          class="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => void run(() => bridge.send("signInOAuth", {}))}
        >
          {busy && !showToken ? "Waiting for Fastmail..." : "Sign in with Fastmail"}
        </button>
      )}

      {oauthAvailable && !showToken && (
        <button class="link-button" onClick={() => setShowToken(true)}>
          Use an API token instead
        </button>
      )}

      {showToken && (
        <form class="token-form" onSubmit={submitToken}>
          <label for="api-token">API token</label>
          <input
            id="api-token"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder="fmu1-..."
            value={token}
            onInput={(e) => setToken(e.currentTarget.value)}
          />
          <p class="hint">
            Create one under Settings, Privacy &amp; Security, API tokens with Masked Email access.{" "}
            <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
              Open Fastmail settings
            </a>
          </p>
          <button
            class={oauthAvailable ? "btn btn-block" : "btn btn-primary btn-block"}
            type="submit"
            disabled={busy || !token.trim()}
          >
            {busy ? "Checking token..." : "Save token"}
          </button>
        </form>
      )}

      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
