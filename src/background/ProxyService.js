import {
  getState,
  patchState,
  saveState,
  normalizeProxy,
  normalizeProxyCheck
} from "./store.js";

const pendingProxyTests = new Map();
const IP_CHECK_URL = "https://api.ipify.org?format=json";

export function getById(proxyId) {
  if (!proxyId) {
    return null;
  }

  return getState().proxies.find((proxy) => proxy.id === proxyId) ?? null;
}

export function getDefault() {
  const state = getState();
  return getById(state.defaultProxyId) ?? state.proxies[0] ?? null;
}

export function getEffectiveForRule(rule) {
  return getById(rule?.proxyId) ?? getDefault();
}

export function hasConfigured() {
  return getState().proxies.some((proxy) => proxy.host && Number(proxy.port));
}

export function getProxyForTestUrl(url) {
  if (!url) {
    return null;
  }

  return pendingProxyTests.get(url) ?? null;
}

export async function save(raw) {
  const proxy = normalizeProxy(raw);

  if (!proxy.host || !proxy.port) {
    throw new Error("Proxy host and port are required.");
  }

  const testResult = await testProxy(proxy);

  if (testResult.status === "error") {
    throw new Error(testResult.message || "Proxy validation failed.");
  }

  const state = getState();
  const index = state.proxies.findIndex((item) => item.id === proxy.id);
  const nextProxies = [...state.proxies];

  if (index >= 0) {
    nextProxies[index] = proxy;
  } else {
    nextProxies.unshift(proxy);
  }

  patchState({
    proxies: nextProxies,
    defaultProxyId: state.defaultProxyId ?? proxy.id,
    proxyChecks: {
      ...state.proxyChecks,
      [proxy.id]: normalizeProxyCheck(testResult)
    }
  });

  await saveState();
}

export async function remove(proxyId) {
  const state = getState();
  const nextProxies = state.proxies.filter((proxy) => proxy.id !== proxyId);
  const nextRules = state.rules.map((rule) =>
    rule.proxyId === proxyId
      ? {
          ...rule,
          proxyId: null
        }
      : rule
  );
  const nextChecks = { ...state.proxyChecks };

  delete nextChecks[proxyId];

  patchState({
    proxies: nextProxies,
    proxyChecks: nextChecks,
    rules: nextRules,
    defaultProxyId:
      state.defaultProxyId === proxyId ? (nextProxies[0]?.id ?? null) : state.defaultProxyId,
    enabled: nextProxies.length === 0 ? false : state.enabled
  });

  await saveState();
}

export async function setDefault(proxyId) {
  if (!getById(proxyId)) {
    throw new Error("Proxy not found.");
  }

  patchState({ defaultProxyId: proxyId });
  await saveState();
}

export function buildProxyInfo(proxy) {
  if (!proxy?.host || !Number(proxy.port)) {
    return { type: "direct" };
  }

  const proxyInfo = {
    type: proxy.type || "https",
    host: proxy.host,
    port: Number(proxy.port)
  };

  if (proxy.type === "socks" || proxy.type === "socks4") {
    proxyInfo.proxyDNS = true;
  }

  return proxyInfo;
}

export function getAuthCredentials(proxy) {
  if (!proxy?.authEnabled || !proxy.username) {
    return undefined;
  }

  return {
    username: proxy.username,
    password: proxy.password || ""
  };
}

function buildCheckResult(status, message) {
  return normalizeProxyCheck({
    status,
    message,
    checkedAt: Date.now(),
    directIp: "",
    proxyIp: ""
  });
}

export async function testProxy(rawProxy) {
  const proxy = normalizeProxy(rawProxy ?? {});
  const shouldPersist = Boolean(rawProxy?.id && getById(rawProxy.id));

  if (!proxy.host || !proxy.port) {
    throw new Error("Proxy host and port are required.");
  }

  const testUrl = `${IP_CHECK_URL}&proxy_browser_test=${encodeURIComponent(crypto.randomUUID())}`;

  pendingProxyTests.set(testUrl, proxy);

  try {
    const directIp = await fetchIp(IP_CHECK_URL);
    const proxyIp = await fetchIp(testUrl);

    if (!proxyIp) {
      throw new Error("Не удалось получить IP через proxy.");
    }

    const sameIpWarning = directIp && proxyIp && directIp === proxyIp;
    const result = normalizeProxyCheck({
      status: "success",
      message: sameIpWarning
        ? `Proxy отвечает, но IP не изменился: ${proxyIp}.`
        : `Подключение через proxy прошло успешно. IP: ${proxyIp}.`,
      checkedAt: Date.now(),
      directIp,
      proxyIp
    });

    if (shouldPersist) {
      await saveCheck(proxy.id, result);
    }

    return result;
  } catch (error) {
    const result = normalizeProxyCheck({
      status: "error",
      message: error?.message || "Не удалось подключиться через proxy.",
      checkedAt: Date.now(),
      directIp: "",
      proxyIp: ""
    });

    if (shouldPersist) {
      await saveCheck(proxy.id, result);
    }

    return result;
  } finally {
    pendingProxyTests.delete(testUrl);
  }
}

async function fetchIp(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`IP service returned ${response.status}.`);
  }

  const data = await response.json();
  const ip = String(data?.ip ?? "").trim();

  if (!ip) {
    throw new Error("IP service returned an empty response.");
  }

  return ip;
}

export async function saveCheck(proxyId, result) {
  const state = getState();

  patchState({
    proxyChecks: {
      ...state.proxyChecks,
      [proxyId]: normalizeProxyCheck(result)
    }
  });

  await saveState();
}
