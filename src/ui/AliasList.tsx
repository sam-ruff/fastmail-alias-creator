import type { MaskedEmail } from "../shared/types";

interface Props {
  aliases: MaskedEmail[];
  highlightId?: string | null;
  empty: string;
  onCopy: (alias: MaskedEmail) => void;
  onToggle: (alias: MaskedEmail) => void;
}

export function AliasList({ aliases, highlightId, empty, onCopy, onToggle }: Props) {
  if (aliases.length === 0) return <p class="empty">{empty}</p>;
  return (
    <ul class="alias-list">
      {aliases.map((alias) => (
        <AliasRow
          key={alias.id}
          alias={alias}
          highlighted={alias.id === highlightId}
          onCopy={onCopy}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  alias: MaskedEmail;
  highlighted: boolean;
  onCopy: (alias: MaskedEmail) => void;
  onToggle: (alias: MaskedEmail) => void;
}

function AliasRow({ alias, highlighted, onCopy, onToggle }: RowProps) {
  const inactive = alias.state === "disabled";
  const site = displayDomain(alias.forDomain);
  const meta = [site, alias.description !== site ? alias.description : ""].filter(Boolean);

  return (
    <li class={`alias-row${highlighted ? " highlighted" : ""}${inactive ? " inactive" : ""}`}>
      <button class="alias-main" title="Copy to clipboard" onClick={() => onCopy(alias)}>
        <span class="alias-email">{alias.email}</span>
        <span class="alias-meta">
          {meta.join(" - ") || "No website"}
          {alias.state !== "enabled" && (
            <span class={`badge badge-${alias.state}`}>{alias.state}</span>
          )}
        </span>
      </button>
      <div class="alias-actions">
        <button
          class="btn btn-small"
          onClick={() => onCopy(alias)}
          aria-label={`Copy ${alias.email}`}
        >
          Copy
        </button>
        <button
          class="btn btn-small btn-quiet"
          onClick={() => onToggle(alias)}
          aria-label={`${inactive ? "Enable" : "Disable"} ${alias.email}`}
        >
          {inactive ? "Enable" : "Disable"}
        </button>
      </div>
    </li>
  );
}

function displayDomain(forDomain: string): string {
  return forDomain
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}
