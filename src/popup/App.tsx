import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { siteFromUrl, type Site } from "../domain";
import type { Status } from "../shared/messages";
import type { MaskedEmail } from "../shared/types";
import { AliasList } from "../ui/AliasList";
import { BridgeError, errorMessage, useBridge } from "../ui/bridge";
import { SignIn } from "../ui/SignIn";
import { useToast } from "../ui/useToast";

type Tab = "site" | "search";

export function App() {
  const bridge = useBridge();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    bridge.send("getStatus", {}).then(setStatus, (err) => setLoadError(errorMessage(err)));
  }, [bridge]);

  if (loadError)
    return (
      <Shell>
        <p class="error">{loadError}</p>
      </Shell>
    );
  if (!status)
    return (
      <Shell>
        <p class="empty">Loading...</p>
      </Shell>
    );
  if (!status.auth.signedIn) {
    return (
      <Shell>
        <SignIn oauthAvailable={status.oauthAvailable} onSignedIn={setStatus} />
      </Shell>
    );
  }
  return <SignedIn status={status} onStatus={setStatus} />;
}

function Shell({
  children,
  actions,
}: {
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <main class="popup">
      <header class="popup-header">
        <h1>Fastmail aliases</h1>
        <div class="header-actions">{actions}</div>
      </header>
      {children}
    </main>
  );
}

function SignedIn({ status, onStatus }: { status: Status; onStatus: (s: Status) => void }) {
  const bridge = useBridge();
  const { toast, show } = useToast();
  const [tab, setTab] = useState<Tab>("site");
  const [site, setSite] = useState<Site | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [siteAliases, setSiteAliases] = useState<MaskedEmail[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MaskedEmail[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const reportError = useCallback(
    (err: unknown) => {
      show(errorMessage(err), "error");
      if (err instanceof BridgeError && err.kind === "auth") {
        void bridge.send("getStatus", {}).then(onStatus);
      }
    },
    [bridge, onStatus, show],
  );

  const queryRef = useRef(query);
  queryRef.current = query;

  const refreshLists = useCallback(
    async (url: string | null) => {
      const [forSite, found] = await Promise.all([
        url ? bridge.send("listForSite", { url }) : Promise.resolve([]),
        bridge.send("search", { query: queryRef.current }),
      ]);
      setSiteAliases(forSite);
      setResults(found);
    },
    [bridge],
  );

  const sync = useCallback(
    async (force: boolean, url: string | null) => {
      setSyncing(true);
      try {
        onStatus(await bridge.send("sync", { force }));
        await refreshLists(url);
      } catch (err) {
        reportError(err);
      } finally {
        setSyncing(false);
      }
    },
    [bridge, onStatus, refreshLists, reportError],
  );

  useEffect(() => {
    void (async () => {
      const url = await bridge.activeTabUrl();
      setTabUrl(url);
      setSite(url ? siteFromUrl(url) : null);
      // Show the cached list straight away, then refresh it from Fastmail.
      await refreshLists(url).catch(reportError);
      await sync(false, url);
    })();
  }, [bridge, refreshLists, reportError, sync]);

  useEffect(() => {
    bridge.send("search", { query }).then(setResults, reportError);
  }, [bridge, query, reportError]);

  const copy = async (alias: MaskedEmail) => {
    try {
      await bridge.copy(alias.email);
      show(`Copied ${alias.email}`);
    } catch (err) {
      reportError(err);
    }
  };

  const create = async () => {
    if (!tabUrl) return;
    setCreating(true);
    try {
      const alias = await bridge.send("create", {
        url: tabUrl,
        description: description || undefined,
      });
      setCreatedId(alias.id);
      setDescription("");
      setShowNote(false);
      await bridge.copy(alias.email);
      show(`Created and copied ${alias.email}`);
      await refreshLists(tabUrl);
    } catch (err) {
      reportError(err);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (alias: MaskedEmail) => {
    const state = alias.state === "disabled" ? "enabled" : "disabled";
    try {
      await bridge.send("setState", { id: alias.id, state });
      show(`${state === "enabled" ? "Enabled" : "Disabled"} ${alias.email}`);
      await refreshLists(tabUrl);
    } catch (err) {
      reportError(err);
    }
  };

  const actions = (
    <>
      <button
        class="btn btn-small btn-quiet"
        onClick={() => void sync(true, tabUrl)}
        disabled={syncing}
        title={
          status.lastSyncedAt
            ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
            : "Not synced yet"
        }
      >
        {syncing ? "Syncing..." : "Sync"}
      </button>
      <button class="btn btn-small btn-quiet" onClick={() => bridge.openOptions()}>
        Settings
      </button>
    </>
  );

  return (
    <Shell actions={actions}>
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "site"} onClick={() => setTab("site")}>
          This site
        </button>
        <button role="tab" aria-selected={tab === "search"} onClick={() => setTab("search")}>
          Search
        </button>
      </nav>

      {tab === "site" && (
        <section class="panel">
          {site ? (
            <>
              <p class="site-name" title={site.origin}>
                {site.hostname}
              </p>
              <button
                class="btn btn-primary btn-block"
                onClick={() => void create()}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create alias and copy"}
              </button>
              {showNote ? (
                <input
                  class="note-input"
                  placeholder={`Note (defaults to ${site.hostname})`}
                  value={description}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && void create()}
                  autoFocus
                />
              ) : (
                <button class="link-button" onClick={() => setShowNote(true)}>
                  Add a note
                </button>
              )}
              <h2>Used on {site.registrableDomain}</h2>
              <AliasList
                aliases={siteAliases}
                highlightId={createdId}
                empty="No aliases for this site yet."
                onCopy={(a) => void copy(a)}
                onToggle={(a) => void toggle(a)}
              />
            </>
          ) : (
            <p class="empty">
              Open a website to create an alias for it. You can still search below.
            </p>
          )}
        </section>
      )}

      {tab === "search" && (
        <section class="panel">
          <input
            class="search-input"
            type="search"
            placeholder="Search by email, website or note"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            autoFocus
          />
          <AliasList
            aliases={results.slice(0, 100)}
            highlightId={createdId}
            empty={query ? "Nothing matches that search." : "No aliases yet."}
            onCopy={(a) => void copy(a)}
            onToggle={(a) => void toggle(a)}
          />
        </section>
      )}

      {toast && (
        <div class={`toast toast-${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </Shell>
  );
}
