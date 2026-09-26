import { render } from "preact";
import { createBridge } from "@bridge";
import { BridgeContext } from "../ui/bridge";
import { Options } from "./Options";
import "../ui/styles.css";

const root = document.getElementById("app");
if (root) {
  render(
    <BridgeContext.Provider value={createBridge()}>
      <Options />
    </BridgeContext.Provider>,
    root,
  );
}
