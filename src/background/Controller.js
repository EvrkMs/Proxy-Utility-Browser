import { getState, saveState, patchState, tryGetHostname } from "./store.js";
import * as ProxyService from "./ProxyService.js";
import * as SiteRouter from "./SiteRouter.js";

export function registerBrowserListeners() {
browser.proxy.onRequest.addListener(
  (requestInfo) => {
    // Тестовый запрос прокси (скрытая вкладка)
    const testProxy = ProxyService.getProxyForTestUrl(requestInfo.url);
    if (testProxy) {
      const proxyInfo = ProxyService.buildProxyInfo(testProxy);
      patchState({
        lastProxyDecision: {
          scope: "test",
          url: requestInfo.url,
          tabId: requestInfo.tabId,
          proxyType: proxyInfo.type,
          proxyHost: proxyInfo.host ?? "",
          proxyPort: proxyInfo.port ?? 0,
          matchedRuleHost: "",
          at: Date.now()
        },
        lastProxyError: ""
      });
      return proxyInfo;
    }

    const state = getState();

    // Расширение выключено / нет прокси / нет hostname
    if (!state.enabled || !ProxyService.hasConfigured() || !tryGetHostname(requestInfo.url)) {
      return { type: "direct" };
    }

    // Главное изменение: больше не режем по type.
    // Если вкладка матчится по правилу — проксируем ВСЕ её запросы.
    let rule = null;

    if (requestInfo.type === "main_frame") {
      // Для документа всегда смотрим по URL (самый надёжный источник)
      rule = SiteRouter.findMatchingRuleForUrl(requestInfo.url);
    } else if (requestInfo.tabId >= 0) {
      // Для всех остальных ресурсов — по контексту вкладки
      rule = SiteRouter.findMatchingRule(requestInfo.tabId);

      // Защита от гонки: если контекст вкладки ещё не успел обновиться,
      // а это ранний sub-resource — пробуем по URL как fallback
      if (!rule) {
        rule = SiteRouter.findMatchingRuleForUrl(requestInfo.url);
      }
    }

    if (!rule) {
      return { type: "direct" };
    }

    const effectiveProxy = ProxyService.getEffectiveForRule(rule);
    const proxyInfo = ProxyService.buildProxyInfo(effectiveProxy);

    patchState({
      lastProxyDecision: {
        scope: "rule",
        url: requestInfo.url,
        tabId: requestInfo.tabId,
        proxyType: proxyInfo.type,
        proxyHost: proxyInfo.host ?? "",
        proxyPort: proxyInfo.port ?? 0,
        matchedRuleHost: rule.matchHost ?? "",
        at: Date.now()
      },
      lastProxyError: ""
    });

    return proxyInfo;
  },
  { urls: ["<all_urls>"] }
);

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading") {
      SiteRouter.onTabNavigated(tabId, tab?.url);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    SiteRouter.onTabClosed(tabId);
  });

browser.proxy.onRequest.addListener(
    (requestInfo) => {
      if (requestInfo.type !== "main_frame" && requestInfo.type !== "xmlhttprequest") {
            return { type: "direct" };
          }

      const testProxy = ProxyService.getProxyForTestUrl(requestInfo.url);

      if (testProxy) {
        const proxyInfo = ProxyService.buildProxyInfo(testProxy);
        patchState({
          lastProxyDecision: {
            scope: "test",
            url: requestInfo.url,
            tabId: requestInfo.tabId,
            proxyType: proxyInfo.type,
            proxyHost: proxyInfo.host ?? "",
            proxyPort: proxyInfo.port ?? 0,
            matchedRuleHost: "",
            at: Date.now()
          },
          lastProxyError: ""
        });
        // Убрали saveState() отсюда
        return proxyInfo;
      }

      const state = getState();

      if (!state.enabled || !ProxyService.hasConfigured() || !tryGetHostname(requestInfo.url)) {
        return { type: "direct" };
      }

      const rule =
        requestInfo.type === "main_frame"
          ? SiteRouter.findMatchingRuleForUrl(requestInfo.url)
          : requestInfo.tabId >= 0
            ? SiteRouter.findMatchingRule(requestInfo.tabId)
            : null;

      if (!rule) {
        return { type: "direct" };
      }

      const effectiveProxy = ProxyService.getEffectiveForRule(rule);
      const proxyInfo = ProxyService.buildProxyInfo(effectiveProxy);

      patchState({
        lastProxyDecision: {
          scope: "rule",
          url: requestInfo.url,
          tabId: requestInfo.tabId,
          proxyType: proxyInfo.type,
          proxyHost: proxyInfo.host ?? "",
          proxyPort: proxyInfo.port ?? 0,
          matchedRuleHost: rule.matchHost ?? "",
          at: Date.now()
        },
        lastProxyError: ""
      });
      // Убрали saveState() отсюда
      return proxyInfo;
    },
    { urls: ["<all_urls>"] }
  );

  browser.webRequest.onAuthRequired.addListener(
    (details) => {
      const testProxy = ProxyService.getProxyForTestUrl(details.url);

      if (testProxy) {
        const credentials = ProxyService.getAuthCredentials(testProxy);
        return credentials ? { authCredentials: credentials } : {};
      }

      const state = getState();

      if (!details.isProxy || !state.enabled || !ProxyService.hasConfigured()) {
        return {};
      }

      const rule = details.tabId >= 0 ? SiteRouter.findMatchingRule(details.tabId) : null;
      const proxy = ProxyService.getEffectiveForRule(rule);
      const credentials = ProxyService.getAuthCredentials(proxy);

      return credentials ? { authCredentials: credentials } : {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

  browser.proxy.onError.addListener((error) => {
    patchState({
      lastProxyError: error?.message ?? "Unknown proxy error"
    });
  });
}

export function registerMessageListener() {
  browser.runtime.onMessage.addListener((message) => {
    return handleMessage(message).catch((error) => {
      throw new Error(error?.message ?? "Unknown error");
    });
  });
}

async function handleMessage(message) {
  switch (message?.type) {
    case "state:get":
      return getState();

    case "extension:setEnabled":
      patchState({ enabled: Boolean(message.payload?.enabled) });
      await saveState();
      return getState();

    case "proxy:save":
      await ProxyService.save(message.payload ?? {});
      return getState();

    case "proxy:remove":
      await ProxyService.remove(message.payload?.id);
      return getState();

    case "proxy:setDefault":
      await ProxyService.setDefault(message.payload?.id);
      return getState();

    case "proxy:test":
      return ProxyService.testProxy(message.payload ?? {});

    case "rule:addFromTab":
      {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true
        });
        const tab = tabs[0];

        if (!tab?.id) {
          throw new Error("Active tab not found.");
        }

        await SiteRouter.addRuleFromTab(tab.id, tab.url);
        return getState();
      }

    case "rule:addManual":
      await SiteRouter.addManualRule(message.payload?.value);
      return getState();

    case "rule:addTemplate":
      await SiteRouter.addManualRules(message.payload?.values ?? []);
      return getState();

    case "rule:remove":
      await SiteRouter.removeRule(message.payload?.id);
      return getState();

    case "rule:toggle":
      await SiteRouter.toggleRule(message.payload?.id, message.payload?.enabled);
      return getState();

    case "rule:setProxy":
      {
        const { id, proxyId } = message.payload ?? {};

        if (proxyId && !ProxyService.getById(proxyId)) {
          throw new Error("Proxy not found.");
        }

        await SiteRouter.setRuleProxy(id, proxyId ?? null);
        return getState();
      }

    default:
      return undefined;
  }
}
