import {
  getState,
  patchState,
  saveState,
  normalizeRule,
  normalizeHost,
  normalizePathPrefix,
  tryGetHostname,
  tryGetPathname
} from "./store.js";

function getMatchKey(hostname) {
  return normalizeHost(hostname).replace(/^www\./, "");
}

function getHostVariants(hostname) {
  const normalized = normalizeHost(hostname);
  const matchKey = getMatchKey(normalized);
  const variants = new Set([normalized, matchKey]);

  if (matchKey) {
    variants.add(`www.${matchKey}`);
  }

  return Array.from(variants).filter(Boolean).sort();
}

function normalizeRuleHosts(hosts, siteHost) {
  const matchKey = getMatchKey(siteHost);

  return Array.from(
    new Set(
      (hosts ?? [])
        .map((host) => {
          const normalized = normalizeHost(host);
          return isSameRuleHost(normalized, siteHost) ? matchKey : normalized;
        })
        .filter(Boolean)
    )
  ).sort();
}

function isSameRuleHost(left, right) {
  return getMatchKey(left) === getMatchKey(right);
}

function matchesRuleHost(siteHost, ruleHost) {
  const siteKey = getMatchKey(siteHost);
  const ruleKey = getMatchKey(ruleHost);

  if (!siteKey || !ruleKey) {
    return false;
  }

  return siteKey === ruleKey || siteKey.endsWith(`.${ruleKey}`);
}

function matchesRulePath(sitePath, pathPrefix) {
  const normalizedSitePath = normalizePathPrefix(sitePath);
  const normalizedPrefix = normalizePathPrefix(pathPrefix);

  if (!normalizedPrefix) {
    return true;
  }

  return (
    normalizedSitePath === normalizedPrefix ||
    normalizedSitePath.startsWith(`${normalizedPrefix}/`)
  );
}

function compareRuleSpecificity(left, right) {
  return (right.pathPrefix?.length ?? 0) - (left.pathPrefix?.length ?? 0);
}

function findRuleByTarget(hostname, pathname = "") {
  const normalizedHost = normalizeHost(hostname);
  const normalizedPath = normalizePathPrefix(pathname);

  if (!normalizedHost) {
    return null;
  }

  const matches = getState().rules.filter((rule) => {
      if (!rule.enabled || !rule.matchHost) {
        return false;
      }

      return (
        matchesRuleHost(normalizedHost, rule.matchHost) &&
        matchesRulePath(normalizedPath, rule.pathPrefix)
      );
    });

  matches.sort(compareRuleSpecificity);
  return matches[0] ?? null;
}

export function getTabContext(tabId) {
  return getState().tabContexts[String(tabId)] ?? null;
}

export function findMatchingRule(tabId) {
  const tabContext = getTabContext(tabId);
  const siteHost = normalizeHost(tabContext?.siteHost);
  const sitePath = normalizePathPrefix(tabContext?.sitePath);

  if (!siteHost) {
    return null;
  }

  return findRuleByTarget(siteHost, sitePath);
}

export function findMatchingRuleForUrl(url) {
  return findRuleByTarget(tryGetHostname(url), tryGetPathname(url));
}

export function rememberTabSite(tabId, url, resetHosts = false) {
  if (tabId < 0) {
    return;
  }

  const siteHost = tryGetHostname(url);
  const sitePath = tryGetPathname(url);

  if (!siteHost) {
    return;
  }

  const state = getState();
  const tabKey = String(tabId);

  patchState({
    tabHosts: {
      ...state.tabHosts,
      [tabKey]: resetHosts ? [] : state.tabHosts[tabKey] ?? []
    },
    tabContexts: {
      ...state.tabContexts,
      [tabKey]: {
        siteHost,
        sitePath
      }
    }
  });

  saveState().catch(console.error);
}

export function onRequestSeen(tabId, url, type) {
  if (tabId < 0) {
    return;
  }

  const hostname = tryGetHostname(url);
  const pathname = tryGetPathname(url);

  if (!hostname) {
    return;
  }

  const state = getState();
  const tabKey = String(tabId);
  const current = new Set(state.tabHosts[tabKey] ?? []);
  const previousSize = current.size;
  const nextTabContexts =
    type === "main_frame"
      ? {
          ...state.tabContexts,
          [tabKey]: {
            siteHost: hostname,
            sitePath: pathname
          }
        }
      : state.tabContexts;

  current.add(hostname);

  if (current.size !== previousSize || type === "main_frame") {
    patchState({
      tabHosts: {
        ...state.tabHosts,
        [tabKey]: Array.from(current).sort()
      },
      tabContexts: nextTabContexts
    });

    saveState().catch(console.error);
  }
}

export function onTabNavigated(tabId, url) {
  rememberTabSite(tabId, url, true);
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
  const hosts = normalizeRuleHosts(
    [...(state.tabHosts[tabKey] ?? []), ...getHostVariants(siteHost)],
    siteHost
  );

  const nextRules = [...state.rules];
  const existing = nextRules.find(
    (rule) => isSameRuleHost(rule.matchHost, siteHost) && !normalizePathPrefix(rule.pathPrefix)
  );

  if (existing) {
    existing.hosts = normalizeRuleHosts([...existing.hosts, ...hosts], siteHost);
    existing.enabled = true;
  } else {
    nextRules.unshift(
      normalizeRule({
        label: getMatchKey(siteHost),
        matchHost: getMatchKey(siteHost),
        pathPrefix: "",
        hosts
      })
    );
  }

  patchState({
    rules: nextRules,
    tabContexts: {
      ...state.tabContexts,
      [tabKey]: {
        siteHost,
        sitePath: tryGetPathname(url)
      }
    }
  });

  await saveState();
}

export async function addManualRule(value) {
  const trimmed = String(value ?? "").trim();
  const parsedHost = tryGetHostname(trimmed);
  const parsedPath = tryGetPathname(trimmed);
  const fallbackValue = trimmed.replace(/^[a-z]+:\/\//i, "").split(/[?#]/, 1)[0];
  const [rawHost = "", ...rawPathParts] = fallbackValue.split("/");
  const siteHost = parsedHost || normalizeHost(rawHost);
  const pathPrefix = parsedHost
    ? parsedPath
    : normalizePathPrefix(rawPathParts.length ? rawPathParts.join("/") : "");

  if (!siteHost) {
    throw new Error("Не удалось распознать сайт. Укажите домен или полный URL.");
  }

  const state = getState();
  const nextRules = [...state.rules];
  const existing = nextRules.find(
    (rule) =>
      isSameRuleHost(rule.matchHost, siteHost) &&
      normalizePathPrefix(rule.pathPrefix) === pathPrefix
  );
  const hosts = [getMatchKey(siteHost)];
  const label = `${getMatchKey(siteHost)}${pathPrefix}`;

  if (existing) {
    existing.enabled = true;
    existing.hosts = normalizeRuleHosts([...(existing.hosts ?? []), ...hosts], siteHost);
  } else {
    nextRules.unshift(
      normalizeRule({
        label,
        matchHost: getMatchKey(siteHost),
        pathPrefix,
        hosts
      })
    );
  }

  patchState({
    rules: nextRules
  });

  await saveState();
}

export async function addManualRules(values) {
  for (const value of values ?? []) {
    await addManualRule(value);
  }
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
