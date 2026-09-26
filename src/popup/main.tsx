import { render } from "preact";
import { createBridge } from "@bridge";
import { BridgeContext } from "../ui/bridge";
import { App } from "./App";
import "../ui/styles.css";

const root = document.getElementById("app");
if (root) {
  render(
    <BridgeContext.Provider value={createBridge()}>
      <App />
    </BridgeContext.Provider>,
    root,
  );
}
