const elements = {
  tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
  extensionEnabled: document.getElementById("extension-enabled"),
  currentSite: document.getElementById("current-site"),
  currentMode: document.getElementById("current-mode"),
  noProxyState: document.getElementById("no-proxy-state"),
  homeActions: document.getElementById("home-actions"),
  goToAddProxy: document.getElementById("go-to-add-proxy"),
  addCurrentSite: document.getElementById("add-current-site"),
  activeProxyLabel: document.getElementById("active-proxy-label"),
  suggestedHosts: document.getElementById("suggested-hosts"),
  rulesList: document.getElementById("rules-list"),
  proxyForm: document.getElementById("proxy-form"),
  proxyName: document.getElementById("proxy-name"),
  proxyType: document.getElementById("proxy-type"),
  proxyHost: document.getElementById("proxy-host"),
  proxyPort: document.getElementById("proxy-port"),
  proxyAuthEnabled: document.getElementById("proxy-auth-enabled"),
  authFields: document.getElementById("auth-fields"),
  proxyUsername: document.getElementById("proxy-username"),
  proxyPassword: document.getElementById("proxy-password"),
  proxyList: document.getElementById("proxy-list"),
  defaultProxyLabel: document.getElementById("default-proxy-label"),
  status: document.getElementById("status")
};

let popupState = null;
let activeTabName = "home";

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#9d261d" : "#3a5e81";
}

function switchTab(tabName) {
  activeTabName = tabName;

  for (const button of elements.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }

  for (const panel of elements.tabPanels) {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabName);
  }
}

function setAuthFieldsVisible(visible) {
  elements.authFields.classList.toggle("hidden", !visible);
}

function renderSuggestedHosts(hosts) {
  elements.suggestedHosts.textContent = "";

  if (!hosts.length) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "Пока ничего не замечено.";
    elements.suggestedHosts.appendChild(item);
    return;
  }

  for (const host of hosts) {
    const item = document.createElement("li");
    item.textContent = host;
    elements.suggestedHosts.appendChild(item);
  }
}

function buildChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

async function syncState(newState, successMessage) {
  popupState = newState;
  render(newState);

  if (successMessage) {
    setStatus(successMessage);
  }
}

function createEmptyMessage(message) {
  const empty = document.createElement("div");
  empty.className = "info-card";
  empty.innerHTML = `<p class="muted">${message}</p>`;
  return empty;
}

function renderRules(rules, proxies) {
  elements.rulesList.textContent = "";

  if (!rules.length) {
    elements.rulesList.appendChild(createEmptyMessage("Пока нет сайтов, привязанных к proxy."));
    return;
  }

  for (const rule of rules) {
    const tile = document.createElement("article");
    tile.className = "rule-tile";

    const main = document.createElement("div");
    main.className = "rule-main";

    const title = document.createElement("div");
    title.className = "rule-title";
    title.textContent = rule.label || rule.matchHost;

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = rule.proxyName
      ? `Сайт использует конкретный proxy: ${rule.proxyName}`
      : `Сайт использует proxy по умолчанию: ${rule.effectiveProxyName || "не выбран"}`;

    const chips = document.createElement("div");
    chips.className = "chips";

    chips.append(
      buildChip(rule.enabled ? "Включено" : "Выключено"),
      buildChip(`Сайт: ${rule.matchHost || "не определён"}`)
    );

    main.append(title, meta, chips);

    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "rule-gear";
    gear.textContent = "⚙";

    const menu = document.createElement("div");
    menu.className = "rule-menu hidden";

    const proxyRow = document.createElement("div");
    proxyRow.className = "menu-row";

    const proxySelect = document.createElement("select");
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Использовать proxy по умолчанию";
    proxySelect.appendChild(defaultOption);

    for (const proxy of proxies) {
      const option = document.createElement("option");
      option.value = proxy.id;
      option.textContent = proxy.name;
      proxySelect.appendChild(option);
    }

    proxySelect.value = rule.proxyId || "";

    const assignButton = document.createElement("button");
    assignButton.type = "button";
    assignButton.className = "menu-button";
    assignButton.textContent = "Сохранить";
    assignButton.addEventListener("click", async () => {
      try {
        const state = await browser.runtime.sendMessage({
          type: "rules:setProxy",
          payload: {
            id: rule.id,
            proxyId: proxySelect.value || null
          }
        });
        await syncState(state, "Настройка proxy для сайта обновлена.");
      } catch (error) {
        setStatus(error.message || "Не удалось назначить proxy.", true);
      }
    });

    proxyRow.append(proxySelect, assignButton);

    const actionsRow = document.createElement("div");
    actionsRow.className = "menu-row";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "ghost";
    toggleButton.textContent = rule.enabled ? "Выключить" : "Включить";
    toggleButton.addEventListener("click", async () => {
      try {
        const state = await browser.runtime.sendMessage({
          type: "rules:toggle",
          payload: {
            id: rule.id,
            enabled: !rule.enabled
          }
        });
        await syncState(state, "Состояние правила обновлено.");
      } catch (error) {
        setStatus(error.message || "Не удалось обновить правило.", true);
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async () => {
      try {
        const state = await browser.runtime.sendMessage({
          type: "rules:remove",
          payload: { id: rule.id }
        });
        await syncState(state, "Правило удалено.");
      } catch (error) {
        setStatus(error.message || "Не удалось удалить правило.", true);
      }
    });

    actionsRow.append(toggleButton, deleteButton);
    menu.append(proxyRow, actionsRow);

    gear.addEventListener("click", () => {
      const isOpen = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden", isOpen);
      tile.classList.toggle("menu-open", !isOpen);
    });

    tile.append(main, gear, menu);
    elements.rulesList.appendChild(tile);
  }
}

function renderProxies(proxies, defaultProxyId) {
  elements.proxyList.textContent = "";

  if (!proxies.length) {
    elements.proxyList.appendChild(createEmptyMessage("Список proxy пока пуст."));
    return;
  }

  for (const proxy of proxies) {
    const card = document.createElement("article");
    card.className = "proxy-card";

    const main = document.createElement("div");
    main.className = "proxy-main";

    const title = document.createElement("div");
    title.className = "proxy-title";
    title.textContent = proxy.name;

    const address = document.createElement("p");
    address.className = "muted";
    address.textContent = `${proxy.type.toUpperCase()} • ${proxy.host}:${proxy.port}`;

    const meta = document.createElement("div");
    meta.className = "proxy-meta";
    meta.append(buildChip(proxy.authEnabled ? "Auth включён" : "Без auth"));

    if (proxy.id === defaultProxyId) {
      meta.append(buildChip("По умолчанию"));
    }

    main.append(title, address, meta);

    const actions = document.createElement("div");
    actions.className = "proxy-actions";

    const defaultButton = document.createElement("button");
    defaultButton.type = "button";
    defaultButton.className = "proxy-action";
    defaultButton.textContent = proxy.id === defaultProxyId ? "Текущий" : "Сделать основным";
    defaultButton.disabled = proxy.id === defaultProxyId;
    defaultButton.addEventListener("click", async () => {
      try {
        const state = await browser.runtime.sendMessage({
          type: "proxy:setDefault",
          payload: { id: proxy.id }
        });
        await syncState(state, "Proxy по умолчанию обновлён.");
      } catch (error) {
        setStatus(error.message || "Не удалось выбрать proxy по умолчанию.", true);
      }
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Удалить";
    removeButton.addEventListener("click", async () => {
      try {
        const state = await browser.runtime.sendMessage({
          type: "proxy:remove",
          payload: { id: proxy.id }
        });
        await syncState(state, "Proxy удалён.");
      } catch (error) {
        setStatus(error.message || "Не удалось удалить proxy.", true);
      }
    });

    actions.append(defaultButton, removeButton);
    card.append(main, actions);
    elements.proxyList.appendChild(card);
  }
}

function render(state) {
  popupState = state;

  elements.extensionEnabled.checked = Boolean(state.enabled && state.hasProxy);
  elements.extensionEnabled.disabled = !state.hasProxy;
  elements.currentSite.textContent = state.activeTab?.hostname || "Нет активной вкладки";
  elements.currentMode.textContent = state.activeRuleId
    ? `Для этого сайта будет использован ${state.activeRuleProxyName || "proxy по умолчанию"}.`
    : "Для этого сайта отдельное правило пока не создано.";
  elements.activeProxyLabel.textContent = state.defaultProxyName
    ? `Proxy по умолчанию: ${state.defaultProxyName}`
    : "Proxy по умолчанию пока не выбран.";
  elements.defaultProxyLabel.textContent = state.defaultProxyName
    ? `По умолчанию используется: ${state.defaultProxyName}`
    : "Proxy по умолчанию не выбран.";

  elements.noProxyState.classList.toggle("hidden", state.hasProxy);
  elements.homeActions.classList.toggle("hidden", !state.hasProxy);

  elements.addCurrentSite.disabled = !state.activeTab || !state.hasProxy;

  renderSuggestedHosts(state.suggestedHosts || []);
  renderRules(state.rules || [], state.proxies || []);
  renderProxies(state.proxies || [], state.defaultProxyId);

  setAuthFieldsVisible(elements.proxyAuthEnabled.checked);
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "popup:getState" });
  render(state);
}

for (const button of elements.tabButtons) {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
}

elements.goToAddProxy.addEventListener("click", () => {
  switchTab("proxies");
});

elements.proxyAuthEnabled.addEventListener("change", () => {
  setAuthFieldsVisible(elements.proxyAuthEnabled.checked);
});

elements.extensionEnabled.addEventListener("change", async () => {
  try {
    const state = await browser.runtime.sendMessage({
      type: "extension:setEnabled",
      payload: {
        enabled: elements.extensionEnabled.checked
      }
    });
    await syncState(state, elements.extensionEnabled.checked ? "Proxy включён." : "Proxy выключен.");
  } catch (error) {
    setStatus(error.message || "Не удалось изменить состояние proxy.", true);
  }
});

elements.addCurrentSite.addEventListener("click", async () => {
  try {
    const state = await browser.runtime.sendMessage({
      type: "rules:addFromActiveTab"
    });
    await syncState(state, "Текущий сайт добавлен в правила proxy.");
    switchTab("settings");
  } catch (error) {
    setStatus(error.message || "Не удалось добавить текущий сайт.", true);
  }
});

elements.proxyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const state = await browser.runtime.sendMessage({
      type: "proxy:saveProfile",
      payload: {
        name: elements.proxyName.value,
        type: elements.proxyType.value,
        host: elements.proxyHost.value,
        port: elements.proxyPort.value,
        authEnabled: elements.proxyAuthEnabled.checked,
        username: elements.proxyUsername.value,
        password: elements.proxyPassword.value
      }
    });

    elements.proxyForm.reset();
    elements.proxyType.value = "https";
    elements.proxyPort.value = "443";
    elements.proxyAuthEnabled.checked = false;
    setAuthFieldsVisible(false);

    await syncState(state, "Proxy сохранён.");
  } catch (error) {
    setStatus(error.message || "Не удалось сохранить proxy.", true);
  }
});

elements.proxyType.addEventListener("change", () => {
  if (!elements.proxyPort.value) {
    elements.proxyPort.value = elements.proxyType.value === "http" ? "80" : "443";
  }
});

switchTab(activeTabName);
refresh().catch((error) => {
  setStatus(error.message || "Не удалось загрузить состояние расширения.", true);
});
