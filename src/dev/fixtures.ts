import type { MaskedEmail } from "../shared/types";

function alias(
  id: string,
  email: string,
  forDomain: string,
  description: string,
  createdAt: string,
  state: MaskedEmail["state"] = "enabled",
): MaskedEmail {
  return {
    id,
    email,
    state,
    forDomain,
    description,
    url: null,
    createdBy: "Fastmail",
    createdAt,
    lastMessageAt: null,
  };
}

export const SAMPLE_ALIASES: MaskedEmail[] = [
  alias(
    "me-1",
    "brisk.hazel4821@fastmail.com",
    "https://github.com",
    "GitHub",
    "2026-08-02T10:00:00Z",
  ),
  alias(
    "me-2",
    "north.cedar9913@fastmail.com",
    "https://gist.github.com",
    "Gists",
    "2026-06-11T09:30:00Z",
  ),
  alias(
    "me-3",
    "amber.finch2207@fastmail.com",
    "https://www.amazon.co.uk",
    "Amazon UK",
    "2026-05-20T18:12:00Z",
  ),
  alias(
    "me-4",
    "quiet.river6034@fastmail.com",
    "news.ycombinator.com",
    "Hacker News",
    "2026-03-01T12:00:00Z",
  ),
  alias(
    "me-5",
    "pale.orbit1180@fastmail.com",
    "https://shop.example.co.uk",
    "Old shop account",
    "2025-11-14T08:00:00Z",
    "disabled",
  ),
  alias(
    "me-6",
    "gone.alias0001@fastmail.com",
    "https://github.com",
    "Deleted one",
    "2025-01-01T08:00:00Z",
    "deleted",
  ),
];
