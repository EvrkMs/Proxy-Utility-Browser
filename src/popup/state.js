function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
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

function findMatchingRuleForTab(rules, tabContexts, tabId) {
  const siteHost = normalizeHost(tabContexts[String(tabId)]?.siteHost);

  if (!siteHost) {
    return null;
  }

  return (
    rules.find((rule) => {
      if (!rule.enabled || !rule.matchHost) {
        return false;
      }

      return siteHost === rule.matchHost || siteHost.endsWith(`.${rule.matchHost}`);
    }) ?? null
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
    rules: rules.map((rule) => resolveRule(rule, proxies, defaultProxyId)),
    activeTab: activeTab
      ? {
          id: activeTab.id,
          title: activeTab.title ?? "",
          url: activeTab.url ?? "",
          hostname: activeHostname
        }
      : null,
    activeRuleId: activeRule?.id ?? null,
    activeRuleSiteHost: activeRule?.matchHost ?? null,
    activeProxyName: activeProxy?.name ?? null,
    suggestedHosts: Array.from(new Set([activeHostname, ...seenHosts].filter(Boolean)))
  };
}
