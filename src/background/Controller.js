import { getState, saveState, patchState, tryGetHostname } from "./store.js";
import * as ProxyService from "./ProxyService.js";
import * as SiteRouter from "./SiteRouter.js";

export function registerBrowserListeners() {
  // Сбор хостов для подсказок в UI (лёгкий, с лимитом внутри SiteRouter)
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      SiteRouter.onRequestSeen(details.tabId, details.url, details.type);
    },
    {
      urls: ["<all_urls>"],
      // Собираем только то, что реально полезно для подсказок.
      // Картинки/шрифты/медиа почти никогда не нужны в UI.
      types: ["main_frame", "sub_frame", "xmlhttprequest", "script", "websocket", "other"]
    }
  );

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tab?.url) {
      SiteRouter.onTabNavigated(tabId, tab.url);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    SiteRouter.onTabClosed(tabId);
  });

  // Единственный слушатель proxy.onRequest
  browser.proxy.onRequest.addListener(
    (requestInfo) => {
      // 1. Тестовый запрос прокси
      const testProxy = ProxyService.getProxyForTestUrl(requestInfo.url);
      if (testProxy) {
        return ProxyService.buildProxyInfo(testProxy);
      }

      const state = getState();

      // 2. Быстрые early-exit (самое важное для производительности)
      if (!state.enabled || !ProxyService.hasConfigured()) {
        return { type: "direct" };
      }

      if (!tryGetHostname(requestInfo.url)) {
        return { type: "direct" };
      }

      // 3. Поиск правила
      let rule = null;

      if (requestInfo.type === "main_frame") {
        rule = SiteRouter.findMatchingRuleForUrl(requestInfo.url);
      } else if (requestInfo.tabId >= 0) {
        rule = SiteRouter.findMatchingRule(requestInfo.tabId);

        // fallback на случай гонки (очень ранние sub-resources)
        if (!rule) {
          rule = SiteRouter.findMatchingRuleForUrl(requestInfo.url);
        }
      }

      if (!rule) {
        return { type: "direct" };
      }

      const effectiveProxy = ProxyService.getEffectiveForRule(rule);
      const proxyInfo = ProxyService.buildProxyInfo(effectiveProxy);

      // 4. lastProxyDecision обновляем ТОЛЬКО для main_frame
      //    (иначе на YouTube будет тысячи patchState в секунду)
      if (requestInfo.type === "main_frame") {
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
      }

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

    case "rule:addFromTab": {
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

    case "rule:setProxy": {
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