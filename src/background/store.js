const STORAGE_KEY = "proxy-browser-state";

export const DEFAULT_STATE = {
  enabled: false,
  defaultProxyId: null,
  proxies: [],
  proxyChecks: {},
  lastProxyError: "",
  lastProxyDecision: null,
  rules: [],
  tabHosts: {},
  tabContexts: {}
};

let state = cloneState(DEFAULT_STATE);

export function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getState() {
  return state;
}

export function setState(nextState) {
  state = nextState;
}

export function patchState(patch) {
  state = { ...state, ...patch };
}

export async function loadState() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  state = migrateState(stored[STORAGE_KEY]);
}

export async function saveState() {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

function migrateState(raw) {
  const next = {
    ...cloneState(DEFAULT_STATE),
    ...(raw ?? {})
  };

  if ((!next.proxies || next.proxies.length === 0) && raw?.proxy?.host) {
    const legacy = normalizeProxy({ ...raw.proxy, name: raw.proxy.host });
    next.proxies = [legacy];
    next.defaultProxyId = legacy.id;
  }

  next.proxies = (next.proxies ?? []).map(normalizeProxy);
  next.proxyChecks = Object.fromEntries(
    Object.entries(next.proxyChecks ?? {}).map(([key, value]) => [key, normalizeProxyCheck(value)])
  );
  next.rules = (next.rules ?? []).map(normalizeRule);
  next.tabHosts = next.tabHosts ?? {};
  next.tabContexts = next.tabContexts ?? {};

  if (!next.proxies.some((proxy) => proxy.id === next.defaultProxyId)) {
    next.defaultProxyId = next.proxies[0]?.id ?? null;
  }

  return next;
}

export function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeHost(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

export function tryGetHostname(url) {
  if (!url) {
    return "";
  }

  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

export function normalizeProxy(proxy) {
  const normalizedType =
    proxy.type === "http" || proxy.type === "https" || proxy.type === "socks" || proxy.type === "socks4"
      ? proxy.type
      : "https";

  return {
    id: proxy.id ?? makeId("proxy"),
    name: String(proxy.name ?? proxy.host ?? "Proxy").trim() || "Proxy",
    type: normalizedType,
    host: String(proxy.host ?? "").trim(),
    port:
      Number(
        proxy.port ??
          (normalizedType === "http"
            ? 80
            : normalizedType === "https"
              ? 443
              : 1080)
      ) || (normalizedType === "http" ? 80 : normalizedType === "https" ? 443 : 1080),
    authEnabled: Boolean(proxy.authEnabled ?? proxy.username),
    username: String(proxy.username ?? "").trim(),
    password: String(proxy.password ?? "")
  };
}

export function normalizeProxyCheck(check) {
  return {
    status: check?.status === "success" ? "success" : check?.status === "error" ? "error" : "idle",
    message: String(check?.message ?? ""),
    checkedAt: Number(check?.checkedAt ?? 0) || 0,
    directIp: String(check?.directIp ?? ""),
    proxyIp: String(check?.proxyIp ?? "")
  };
}

export function normalizeRule(rule) {
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
