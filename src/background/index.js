import { loadState, saveState } from "./store.js";
import { pruneClosedTabs } from "./SiteRouter.js";
import { registerBrowserListeners, registerMessageListener } from "./Controller.js";

async function init() {
  await loadState();
  await pruneClosedTabs();
  await saveState();

  registerBrowserListeners();
  registerMessageListener();
}

init().catch(console.error);
