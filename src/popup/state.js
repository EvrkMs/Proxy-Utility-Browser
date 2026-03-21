function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function getMatchKey(hostname) {
  return normalizeHost(hostname).replace(/^www\./, "");
}

function tryGetHostname(url) {
  if (!url) {
    return "";
  }

  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function normalizePathPrefix(value) {
  const raw = String(value ?? "").trim();

  if (!raw || raw === "/") {
    return "";
  }

  let path = raw;

  try {
    path = new URL(raw).pathname || "/";
  } catch {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path.replace(/\/+$/, "") || "";
}

function tryGetPathname(url) {
  if (!url) {
    return "";
  }

  try {
    return normalizePathPrefix(new URL(url).pathname);
  } catch {
    return "";
  }
}

function getProxyById(proxies, id) {
  if (!id) {
    return null;
  }

  return proxies.find((proxy) => proxy.id === id) ?? null;
}

function getDefaultProxy(proxies, defaultProxyId) {
  return getProxyById(proxies, defaultProxyId) ?? proxies[0] ?? null;
}

function getEffectiveProxy(proxies, defaultProxyId, rule) {
  return getProxyById(proxies, rule?.proxyId) ?? getDefaultProxy(proxies, defaultProxyId);
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

function matchesRuleHost(siteHost, ruleHost) {
  const siteKey = getMatchKey(siteHost);
  const ruleKey = getMatchKey(ruleHost);

  if (!siteKey || !ruleKey) {
    return false;
  }

  return siteKey === ruleKey || siteKey.endsWith(`.${ruleKey}`);
}

function findMatchingRuleForTab(rules, tabContexts, tabId) {
  const tabContext = tabContexts[String(tabId)] ?? {};
  const siteHost = normalizeHost(tabContext.siteHost);
  const sitePath = normalizePathPrefix(tabContext.sitePath);

  if (!siteHost) {
    return null;
  }

  return (
    rules
      .filter((rule) => {
      if (!rule.enabled || !rule.matchHost) {
        return false;
      }

      return (
        matchesRuleHost(siteHost, rule.matchHost) &&
        matchesRulePath(sitePath, rule.pathPrefix)
      );
    })
      .sort(compareRuleSpecificity)[0] ?? null
  );
}

function resolveRule(rule, proxies, defaultProxyId) {
  const assignedProxy = getProxyById(proxies, rule.proxyId);
  const effectiveProxy = assignedProxy ?? getDefaultProxy(proxies, defaultProxyId);

  return {
    ...rule,
    proxyName: assignedProxy?.name ?? null,
    effectiveProxyName: effectiveProxy?.name ?? null
  };
}

export function resolveViewModel(rawState, activeTab) {
  const {
    proxies,
    rules,
    defaultProxyId,
    enabled,
    lastProxyError,
    tabHosts,
    tabContexts,
    proxyChecks = {}
  } = rawState;

  const activeTabId = activeTab?.id ?? null;
  const activeHostname = tryGetHostname(activeTab?.url);
  const activePathname = tryGetPathname(activeTab?.url);
  const activeRule =
    activeTabId != null ? findMatchingRuleForTab(rules, tabContexts, activeTabId) : null;
  const activeProxy = activeRule
    ? getEffectiveProxy(proxies, defaultProxyId, activeRule)
    : getDefaultProxy(proxies, defaultProxyId);
  const seenHosts = activeTabId != null ? (tabHosts[String(activeTabId)] ?? []) : [];

  return {
    enabled,
    hasProxy: proxies.some((proxy) => proxy.host && Number(proxy.port)),
    proxies: proxies.map((proxy) => ({
      ...proxy,
      check: proxyChecks[proxy.id] ?? {
        status: "idle",
        message: "",
        checkedAt: 0
      }
    })),
    defaultProxyId,
    defaultProxyName: getProxyById(proxies, defaultProxyId)?.name ?? null,
    lastProxyError: String(lastProxyError ?? ""),
    lastProxyDecision: rawState.lastProxyDecision ?? null,
    rules: rules.map((rule) => resolveRule(rule, proxies, defaultProxyId)),
    activeTab: activeTab
      ? {
          id: activeTab.id,
          title: activeTab.title ?? "",
          url: activeTab.url ?? "",
          hostname: activeHostname,
          pathname: activePathname
        }
      : null,
    activeRuleId: activeRule?.id ?? null,
    activeRule: activeRule ? resolveRule(activeRule, proxies, defaultProxyId) : null,
    activeRuleSiteHost: activeRule?.matchHost ?? null,
    activeProxyName: activeProxy?.name ?? null,
    suggestedHosts: Array.from(new Set([activeHostname, ...seenHosts].filter(Boolean)))
  };
}
