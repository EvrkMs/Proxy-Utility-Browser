import {
  getState,
  patchState,
  saveState,
  normalizeRule,
  normalizeHost,
  tryGetHostname
} from "./store.js";

export function getTabContext(tabId) {
  return getState().tabContexts[String(tabId)] ?? null;
}

export function findMatchingRule(tabId) {
  const siteHost = normalizeHost(getTabContext(tabId)?.siteHost);

  if (!siteHost) {
    return null;
  }

  return (
    getState().rules.find((rule) => {
      if (!rule.enabled || !rule.matchHost) {
        return false;
      }

      return siteHost === rule.matchHost || siteHost.endsWith(`.${rule.matchHost}`);
    }) ?? null
  );
}

export function onRequestSeen(tabId, url) {
  if (tabId < 0) {
    return;
  }

  const hostname = tryGetHostname(url);

  if (!hostname) {
    return;
  }

  const state = getState();
  const tabKey = String(tabId);
  const current = new Set(state.tabHosts[tabKey] ?? []);
  const previousSize = current.size;

  current.add(hostname);

  if (current.size !== previousSize) {
    patchState({
      tabHosts: {
        ...state.tabHosts,
        [tabKey]: Array.from(current).sort()
      }
    });

    saveState().catch(console.error);
  }
}

export function onTabNavigated(tabId, url) {
  const state = getState();
  const tabKey = String(tabId);

  patchState({
    tabHosts: {
      ...state.tabHosts,
      [tabKey]: []
    },
    tabContexts: {
      ...state.tabContexts,
      [tabKey]: {
        siteHost: tryGetHostname(url)
      }
    }
  });

  saveState().catch(console.error);
}

export function onTabClosed(tabId) {
  const state = getState();
  const tabKey = String(tabId);
  const nextHosts = { ...state.tabHosts };
  const nextContexts = { ...state.tabContexts };

  delete nextHosts[tabKey];
  delete nextContexts[tabKey];

  patchState({
    tabHosts: nextHosts,
    tabContexts: nextContexts
  });

  saveState().catch(console.error);
}

export async function pruneClosedTabs() {
  const tabs = await browser.tabs.query({});
  const activeIds = new Set(tabs.map((tab) => String(tab.id)));
  const state = getState();

  patchState({
    tabHosts: Object.fromEntries(
      Object.entries(state.tabHosts).filter(([id]) => activeIds.has(id))
    ),
    tabContexts: Object.fromEntries(
      Object.entries(state.tabContexts).filter(([id]) => activeIds.has(id))
    )
  });

  await saveState();
}

export async function addRuleFromTab(tabId, url) {
  const siteHost = tryGetHostname(url);

  if (!siteHost) {
    throw new Error("Current tab does not have a supported hostname.");
  }

  const tabKey = String(tabId);
  const state = getState();
  const hosts = Array.from(
    new Set([...(state.tabHosts[tabKey] ?? []), siteHost].map(normalizeHost).filter(Boolean))
  ).sort();

  const nextRules = [...state.rules];
  const existing = nextRules.find((rule) => rule.matchHost === siteHost);

  if (existing) {
    existing.hosts = Array.from(new Set([...existing.hosts, ...hosts])).sort();
    existing.enabled = true;
  } else {
    nextRules.unshift(
      normalizeRule({
        label: siteHost,
        matchHost: siteHost,
        hosts
      })
    );
  }

  patchState({
    rules: nextRules,
    tabContexts: {
      ...state.tabContexts,
      [tabKey]: {
        siteHost
      }
    }
  });

  await saveState();
}

export async function removeRule(ruleId) {
  patchState({
    rules: getState().rules.filter((rule) => rule.id !== ruleId)
  });

  await saveState();
}

export async function toggleRule(ruleId, enabled) {
  const state = getState();
  const rule = state.rules.find((item) => item.id === ruleId);

  if (!rule) {
    throw new Error("Rule not found.");
  }

  patchState({
    rules: state.rules.map((item) =>
      item.id === ruleId
        ? {
            ...item,
            enabled: Boolean(enabled)
          }
        : item
    )
  });

  await saveState();
}

export async function setRuleProxy(ruleId, proxyId) {
  const state = getState();
  const rule = state.rules.find((item) => item.id === ruleId);

  if (!rule) {
    throw new Error("Rule not found.");
  }

  patchState({
    rules: state.rules.map((item) =>
      item.id === ruleId
        ? {
            ...item,
            proxyId: proxyId ?? null
          }
        : item
    )
  });

  await saveState();
}
