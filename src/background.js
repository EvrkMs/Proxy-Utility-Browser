const STORAGE_KEY = "proxy-browser-state";

const DEFAULT_STATE = {
  enabled: false,
  defaultProxyId: null,
  proxies: [],
  rules: [],
  tabHosts: {},
  tabContexts: {}
};

let state = cloneState(DEFAULT_STATE);

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function tryGetHostname(url) {
  if (!url) {
    return "";
  }

  try {
    return normalizeHost(new URL(url).hostname);
  } catch (_error) {
    return "";
  }
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function ensureProxyShape(proxy) {
  return {
    id: proxy.id ?? makeId("proxy"),
    name: String(proxy.name ?? proxy.host ?? "Proxy").trim() || "Proxy",
    type: proxy.type === "http" ? "http" : "https",
    host: String(proxy.host ?? "").trim(),
    port: Number(proxy.port ?? (proxy.type === "http" ? 80 : 443)) || 443,
    authEnabled: Boolean(proxy.authEnabled ?? proxy.username),
    username: String(proxy.username ?? "").trim(),
    password: String(proxy.password ?? "")
  };
}

function ensureRuleShape(rule) {
  const uniqueHosts = Array.from(new Set((rule.hosts ?? []).map(normalizeHost).filter(Boolean)));
  const matchHost = normalizeHost(rule.matchHost ?? uniqueHosts[0] ?? "");

  return {
    id: rule.id ?? makeId("rule"),
    label: String(rule.label ?? matchHost ?? "Unnamed rule").trim(),
    enabled: rule.enabled !== false,
    matchHost,
    proxyId: rule.proxyId ?? null,
    hosts: uniqueHosts
  };
}

function getProxyById(proxyId) {
  if (!proxyId) {
    return null;
  }

  return state.proxies.find((item) => item.id === proxyId) ?? null;
}

function getEffectiveProxy(rule) {
  return getProxyById(rule?.proxyId) ?? getProxyById(state.defaultProxyId) ?? state.proxies[0] ?? null;
}

function hasConfiguredProxy() {
  return state.proxies.some((proxy) => proxy.host && Number(proxy.port));
}

function getTabContext(tabId) {
  return state.tabContexts[String(tabId)] ?? null;
}

function findMatchingRuleForTab(tabId) {
  const currentSiteHost = normalizeHost(getTabContext(tabId)?.siteHost);

  if (!currentSiteHost) {
    return null;
  }

  return (
    state.rules.find((rule) => {
      if (!rule.enabled || !rule.matchHost) {
        return false;
      }

      return currentSiteHost === rule.matchHost || currentSiteHost.endsWith(`.${rule.matchHost}`);
    }) ?? null
  );
}

function buildProxyInfo(proxy) {
  if (!proxy?.host || !Number(proxy.port)) {
    return { type: "direct" };
  }

  return {
    type: proxy.type || "https",
    host: proxy.host,
    port: Number(proxy.port),
    proxyDNS: true
  };
}

function getAuthCredentialsForProxy(proxy) {
  if (!proxy?.authEnabled || !proxy.username) {
    return undefined;
  }

  return {
    username: proxy.username,
    password: proxy.password || ""
  };
}

function pruneTabState() {
  const knownTabIds = new Set(Object.keys(state.tabHosts));
  const knownContextIds = new Set(Object.keys(state.tabContexts));

  browser.tabs.query({}).then((tabs) => {
    const activeIds = new Set(tabs.map((tab) => String(tab.id)));
    let changed = false;

    for (const tabId of knownTabIds) {
      if (!activeIds.has(tabId)) {
        delete state.tabHosts[tabId];
        changed = true;
      }
    }

    for (const tabId of knownContextIds) {
      if (!activeIds.has(tabId)) {
        delete state.tabContexts[tabId];
        changed = true;
      }
    }

    if (changed) {
      saveState().catch(console.error);
    }
  }).catch(console.error);
}

function migrateState(rawState) {
  const nextState = {
    ...cloneState(DEFAULT_STATE),
    ...(rawState ?? {})
  };

  if ((!nextState.proxies || nextState.proxies.length === 0) && rawState?.proxy?.host) {
    const legacyProxy = ensureProxyShape({
      ...rawState.proxy,
      name: rawState.proxy.host
    });
    nextState.proxies = [legacyProxy];
    nextState.defaultProxyId = legacyProxy.id;
  }

  nextState.proxies = (nextState.proxies ?? []).map(ensureProxyShape);
  nextState.rules = (nextState.rules ?? []).map(ensureRuleShape);
  nextState.tabHosts = nextState.tabHosts ?? {};
  nextState.tabContexts = nextState.tabContexts ?? {};

  if (!nextState.proxies.some((proxy) => proxy.id === nextState.defaultProxyId)) {
    nextState.defaultProxyId = nextState.proxies[0]?.id ?? null;
  }

  return nextState;
}

async function loadState() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  state = migrateState(stored[STORAGE_KEY]);
}

async function saveState() {
  await browser.storage.local.set({
    [STORAGE_KEY]: state
  });
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] ?? null;
}

function getProxyName(proxyId) {
  if (!proxyId) {
    return null;
  }

  return getProxyById(proxyId)?.name ?? null;
}

function serializeRule(rule) {
  const effectiveProxy = getEffectiveProxy(rule);

  return {
    ...rule,
    proxyName: getProxyName(rule.proxyId),
    effectiveProxyName: effectiveProxy?.name ?? null
  };
}

async function getPopupState() {
  const activeTab = await getActiveTab();
  const activeHostname = tryGetHostname(activeTab?.url);
  const seenHosts = activeTab ? (state.tabHosts[String(activeTab.id)] ?? []) : [];
  const activeRule = activeTab?.id ? findMatchingRuleForTab(activeTab.id) : null;
  const activeRuleProxy = activeRule ? getEffectiveProxy(activeRule) : null;

  return {
    enabled: state.enabled,
    defaultProxyId: state.defaultProxyId,
    defaultProxyName: getProxyName(state.defaultProxyId),
    hasProxy: hasConfiguredProxy(),
    proxies: state.proxies,
    rules: state.rules.map(serializeRule),
    activeTab: activeTab
      ? {
          id: activeTab.id,
          title: activeTab.title ?? "",
          url: activeTab.url ?? "",
          hostname: activeHostname
        }
      : null,
    activeRuleId: activeRule?.id ?? null,
    activeRuleProxyName: activeRuleProxy?.name ?? null,
    suggestedHosts: Array.from(new Set([activeHostname, ...seenHosts].map(normalizeHost).filter(Boolean)))
  };
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    const hostname = tryGetHostname(details.url);

    if (!hostname) {
      return;
    }

    const tabKey = String(details.tabId);
    const nextHosts = new Set(state.tabHosts[tabKey] ?? []);
    const previousSize = nextHosts.size;

    nextHosts.add(hostname);

    if (nextHosts.size !== previousSize) {
      state.tabHosts[tabKey] = Array.from(nextHosts).sort();
      saveState().catch(console.error);
    }
  },
  { urls: ["<all_urls>"] }
);

browser.tabs.onRemoved.addListener((tabId) => {
  delete state.tabHosts[String(tabId)];
  delete state.tabContexts[String(tabId)];
  saveState().catch(console.error);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    state.tabHosts[String(tabId)] = [];
    state.tabContexts[String(tabId)] = {
      siteHost: tryGetHostname(tab?.url)
    };
    saveState().catch(console.error);
  }
});

browser.proxy.onRequest.addListener(
  (requestInfo) => {
    if (!state.enabled || !hasConfiguredProxy() || !tryGetHostname(requestInfo.url)) {
      return { type: "direct" };
    }

    const matchingRule = requestInfo.tabId >= 0 ? findMatchingRuleForTab(requestInfo.tabId) : null;

    if (!matchingRule) {
      return { type: "direct" };
    }

    return buildProxyInfo(getEffectiveProxy(matchingRule));
  },
  { urls: ["<all_urls>"] }
);

browser.webRequest.onAuthRequired.addListener(
  (details) => {
    if (!details.isProxy || !state.enabled || !hasConfiguredProxy()) {
      return {};
    }

    const matchingRule = details.tabId >= 0 ? findMatchingRuleForTab(details.tabId) : null;
    const proxy = getEffectiveProxy(matchingRule);
    const credentials = getAuthCredentialsForProxy(proxy);

    if (!credentials) {
      return {};
    }

    return {
      authCredentials: credentials
    };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "popup:getState":
      return getPopupState();

    case "extension:setEnabled":
      state.enabled = Boolean(message.payload?.enabled);
      return saveState().then(() => getPopupState());

    case "proxy:saveProfile":
      {
        const nextProxy = ensureProxyShape(message.payload ?? {});
        const existingIndex = state.proxies.findIndex((item) => item.id === nextProxy.id);

        if (!nextProxy.host || !nextProxy.port) {
          throw new Error("Proxy host and port are required.");
        }

        if (existingIndex >= 0) {
          state.proxies[existingIndex] = nextProxy;
        } else {
          state.proxies.unshift(nextProxy);
        }

        if (!state.defaultProxyId) {
          state.defaultProxyId = nextProxy.id;
        }

        return saveState().then(() => getPopupState());
      }

    case "proxy:setDefault":
      {
        const proxy = getProxyById(message.payload?.id);

        if (!proxy) {
          throw new Error("Proxy not found.");
        }

        state.defaultProxyId = proxy.id;
        return saveState().then(() => getPopupState());
      }

    case "proxy:remove":
      {
        const proxyId = message.payload?.id;
        state.proxies = state.proxies.filter((item) => item.id !== proxyId);

        if (state.defaultProxyId === proxyId) {
          state.defaultProxyId = state.proxies[0]?.id ?? null;
        }

        state.rules = state.rules.map((rule) =>
          rule.proxyId === proxyId
            ? {
                ...rule,
                proxyId: null
              }
            : rule
        );

        if (!state.proxies.length) {
          state.enabled = false;
        }

        return saveState().then(() => getPopupState());
      }

    case "rules:addFromActiveTab":
      return getActiveTab().then(async (activeTab) => {
        if (!activeTab?.id) {
          throw new Error("Active tab not found.");
        }

        const tabKey = String(activeTab.id);
        const siteHost = tryGetHostname(activeTab.url);
        const hosts = Array.from(
          new Set([...(state.tabHosts[tabKey] ?? []), siteHost].map(normalizeHost).filter(Boolean))
        ).sort();

        if (!siteHost) {
          throw new Error("Current tab does not have a supported hostname.");
        }

        const existingRule = state.rules.find((rule) => rule.matchHost === siteHost);

        if (existingRule) {
          existingRule.hosts = Array.from(new Set([...existingRule.hosts, ...hosts])).sort();
          existingRule.enabled = true;
        } else {
          state.rules.unshift(
            ensureRuleShape({
              label: siteHost,
              matchHost: siteHost,
              hosts
            })
          );
        }

        state.tabContexts[tabKey] = {
          siteHost
        };

        await saveState();
        return getPopupState();
      });

    case "rules:toggle":
      {
        const rule = state.rules.find((item) => item.id === message.payload?.id);

        if (!rule) {
          throw new Error("Rule not found.");
        }

        rule.enabled = Boolean(message.payload?.enabled);
        return saveState().then(() => getPopupState());
      }

    case "rules:remove":
      state.rules = state.rules.filter((item) => item.id !== message.payload?.id);
      return saveState().then(() => getPopupState());

    case "rules:setProxy":
      {
        const rule = state.rules.find((item) => item.id === message.payload?.id);

        if (!rule) {
          throw new Error("Rule not found.");
        }

        const proxyId = message.payload?.proxyId || null;

        if (proxyId && !getProxyById(proxyId)) {
          throw new Error("Proxy not found.");
        }

        rule.proxyId = proxyId;
        return saveState().then(() => getPopupState());
      }

    default:
      return undefined;
  }
});

loadState()
  .then(() => {
    pruneTabState();
    return saveState();
  })
  .catch(console.error);
