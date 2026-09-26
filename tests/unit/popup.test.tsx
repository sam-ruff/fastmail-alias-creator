import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridge } from "../../src/dev/mockBridge";
import { App } from "../../src/popup/App";
import { BridgeContext, type Bridge } from "../../src/ui/bridge";

function renderPopup(query: string) {
  window.history.replaceState(null, "", `/popup/index.html?${query}`);
  const bridge: Bridge = { ...createBridge(), copy: vi.fn().mockResolvedValue(undefined) };
  render(
    <BridgeContext.Provider value={bridge}>
      <App />
    </BridgeContext.Provider>,
  );
  return bridge;
}

afterEach(cleanup);

describe("popup", () => {
  it("offers OAuth first with a token fallback link", async () => {
    renderPopup("scenario=signed-out");
    expect(await screen.findByRole("button", { name: "Sign in with Fastmail" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use an API token instead" }));
    expect(screen.getByLabelText("API token")).toBeTruthy();
  });

  it("shows only the token form when OAuth is not configured", async () => {
    renderPopup("scenario=no-oauth");
    expect(await screen.findByLabelText("API token")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in with Fastmail" })).toBeNull();
  });

  it("lists aliases already used on the current site", async () => {
    renderPopup("scenario=signed-in&url=https://github.com/login");
    expect(await screen.findByText("brisk.hazel4821@fastmail.com")).toBeTruthy();
    expect(screen.getByText("north.cedar9913@fastmail.com")).toBeTruthy();
    expect(screen.queryByText("amber.finch2207@fastmail.com")).toBeNull();
  });

  it("creates and copies an alias in one click", async () => {
    const bridge = renderPopup("scenario=signed-in&url=https://example.org/join");
    fireEvent.click(await screen.findByRole("button", { name: "Create alias and copy" }));

    await waitFor(() => expect(bridge.copy).toHaveBeenCalledTimes(1));
    const [email] = vi.mocked(bridge.copy).mock.calls[0] ?? [];
    expect(email).toMatch(/@fastmail\.com$/);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(await screen.findByText(email as string)).toBeTruthy();
  });

  it("shows rate limit errors", async () => {
    renderPopup("scenario=rate-limit&url=https://example.org/");
    fireEvent.click(await screen.findByRole("button", { name: "Create alias and copy" }));
    expect(await screen.findByText(/Too many aliases/)).toBeTruthy();
  });

  it("searches across all aliases", async () => {
    renderPopup("scenario=signed-in&url=https://github.com/");
    fireEvent.click(await screen.findByRole("tab", { name: "Search" }));
    fireEvent.input(screen.getByPlaceholderText(/Search by email/), {
      target: { value: "amazon" },
    });
    expect(await screen.findByText("amber.finch2207@fastmail.com")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("brisk.hazel4821@fastmail.com")).toBeNull());
  });

  it("explains when the tab is not a website", async () => {
    renderPopup("scenario=signed-in&url=about:newtab");
    expect(await screen.findByText(/Open a website/)).toBeTruthy();
  });
});
