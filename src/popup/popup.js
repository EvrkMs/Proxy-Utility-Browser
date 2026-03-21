import { resolveViewModel } from "./state.js";

const el = {
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
  proxyErrorCard: document.getElementById("proxy-error-card"),
  proxyErrorText: document.getElementById("proxy-error-text"),
  suggestedHosts: document.getElementById("suggested-hosts"),
  rulesList: document.getElementById("rules-list"),
  proxyForm: document.getElementById("proxy-form"),
  proxyId: document.getElementById("proxy-id"),
  proxyFormMode: document.getElementById("proxy-form-mode"),
  proxyFormModeText: document.getElementById("proxy-form-mode-text"),
  proxyName: document.getElementById("proxy-name"),
  proxyType: document.getElementById("proxy-type"),
  proxyHost: document.getElementById("proxy-host"),
  proxyPort: document.getElementById("proxy-port"),
  proxyAuthEnabled: document.getElementById("proxy-auth-enabled"),
  authFields: document.getElementById("auth-fields"),
  proxyUsername: document.getElementById("proxy-username"),
  proxyPassword: document.getElementById("proxy-password"),
  cancelProxyEdit: document.getElementById("cancel-proxy-edit"),
  proxyList: document.getElementById("proxy-list"),
  defaultProxyLabel: document.getElementById("default-proxy-label"),
  testProxyButton: document.getElementById("test-proxy-form"),
  status: document.getElementById("status")
};

let activeTabName = "home";
let lastActiveTab = null;

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.style.color = isError ? "#9d261d" : "#3a5e81";
}

function switchTab(tabName) {
  activeTabName = tabName;

  for (const button of el.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }

  for (const panel of el.tabPanels) {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabName);
  }
}

function getProxyPayload() {
  return {
    id: el.proxyId.value || undefined,
    name: el.proxyName.value,
    type: el.proxyType.value,
    host: el.proxyHost.value,
    port: el.proxyPort.value,
    authEnabled: el.proxyAuthEnabled.checked,
    username: el.proxyUsername.value,
    password: el.proxyPassword.value
  };
}

function getDefaultPortForType(type) {
  switch (type) {
    case "http":
      return "80";
    case "socks":
    case "socks4":
      return "1080";
    case "https":
    default:
      return "443";
  }
}

function resetProxyForm() {
  el.proxyForm.reset();
  el.proxyId.value = "";
  el.proxyType.value = "https";
  el.proxyPort.value = getDefaultPortForType("https");
  el.proxyAuthEnabled.checked = false;
  el.authFields.classList.add("hidden");
  el.proxyFormMode.classList.add("hidden");
  el.cancelProxyEdit.classList.add("hidden");
  el.proxyFormModeText.textContent = "Изменения будут сохранены в существующий профиль.";
}

function startProxyEdit(proxy) {
  el.proxyId.value = proxy.id;
  el.proxyName.value = proxy.name || "";
  el.proxyType.value = proxy.type || "https";
  el.proxyHost.value = proxy.host || "";
  el.proxyPort.value = String(proxy.port || getDefaultPortForType(proxy.type));
  el.proxyAuthEnabled.checked = Boolean(proxy.authEnabled);
  el.proxyUsername.value = proxy.username || "";
  el.proxyPassword.value = proxy.password || "";
  el.authFields.classList.toggle("hidden", !proxy.authEnabled);
  el.proxyFormMode.classList.remove("hidden");
  el.cancelProxyEdit.classList.remove("hidden");
  el.proxyFormModeText.textContent = `Редактируется профиль: ${proxy.name}`;
  switchTab("proxies");
}

async function fetchViewModel() {
  const [rawState, tabs] = await Promise.all([
    browser.runtime.sendMessage({ type: "state:get" }),
    browser.tabs.query({ active: true, currentWindow: true })
  ]);

  lastActiveTab = tabs[0] ?? null;
  return resolveViewModel(rawState, lastActiveTab);
}

function resolveViewModelSync(rawState) {
  return resolveViewModel(rawState, lastActiveTab);
}

async function refresh() {
  const vm = await fetchViewModel();
  render(vm);
}

function render(vm) {
  el.extensionEnabled.checked = Boolean(vm.enabled && vm.hasProxy);
  el.extensionEnabled.disabled = !vm.hasProxy;

  el.currentSite.textContent = vm.activeTab?.hostname || "Нет активной вкладки";
  el.currentMode.textContent = vm.activeRuleId
    ? `Для этого сайта будет использован ${vm.activeProxyName || "proxy по умолчанию"}.`
    : "Для этого сайта отдельное правило пока не создано.";

  el.activeProxyLabel.textContent = vm.defaultProxyName
    ? `Proxy по умолчанию: ${vm.defaultProxyName}`
    : "Proxy по умолчанию пока не выбран.";
  el.proxyErrorCard.classList.toggle("hidden", !vm.lastProxyError);
  el.proxyErrorText.textContent = vm.lastProxyError || "";

  el.defaultProxyLabel.textContent = vm.defaultProxyName
    ? `По умолчанию: ${vm.defaultProxyName}`
    : "Proxy по умолчанию не выбран.";

  el.noProxyState.classList.toggle("hidden", vm.hasProxy);
  el.homeActions.classList.toggle("hidden", !vm.hasProxy);
  el.addCurrentSite.disabled = !vm.activeTab || !vm.hasProxy;

  renderSuggestedHosts(vm.suggestedHosts);
  renderRules(vm.rules, vm.proxies);
  renderProxies(vm.proxies, vm.defaultProxyId);
}

function renderSuggestedHosts(hosts) {
  el.suggestedHosts.textContent = "";

  if (!hosts.length) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "Пока ничего не замечено.";
    el.suggestedHosts.appendChild(item);
    return;
  }

  for (const host of hosts) {
    const item = document.createElement("li");
    item.textContent = host;
    el.suggestedHosts.appendChild(item);
  }
}

function buildChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function createEmptyMessage(text) {
  const div = document.createElement("div");
  div.className = "info-card";
  div.innerHTML = `<p class="muted">${text}</p>`;
  return div;
}

function formatCheckDetails(check) {
  const parts = [];

  if (check?.directIp) {
    parts.push(`Без proxy: ${check.directIp}`);
  }

  if (check?.proxyIp) {
    parts.push(`Через proxy: ${check.proxyIp}`);
  }

  return parts.join(" • ");
}

function renderRules(rules, proxies) {
  el.rulesList.textContent = "";

  if (!rules.length) {
    el.rulesList.appendChild(createEmptyMessage("Пока нет сайтов, привязанных к proxy."));
    return;
  }

  for (const rule of rules) {
    el.rulesList.appendChild(buildRuleTile(rule, proxies));
  }
}

function buildRuleTile(rule, proxies) {
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
    ? `Конкретный proxy: ${rule.proxyName}`
    : `Proxy по умолчанию: ${rule.effectiveProxyName || "не выбран"}`;

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
  defaultOption.textContent = "Proxy по умолчанию";
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
      const raw = await browser.runtime.sendMessage({
        type: "rule:setProxy",
        payload: { id: rule.id, proxyId: proxySelect.value || null }
      });
      render(resolveViewModelSync(raw));
      setStatus("Proxy для сайта обновлён.");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
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
      const raw = await browser.runtime.sendMessage({
        type: "rule:toggle",
        payload: { id: rule.id, enabled: !rule.enabled }
      });
      render(resolveViewModelSync(raw));
      setStatus("Состояние правила обновлено.");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Удалить";
  deleteButton.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "rule:remove",
        payload: { id: rule.id }
      });
      render(resolveViewModelSync(raw));
      setStatus("Правило удалено.");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
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
  return tile;
}

function renderProxies(proxies, defaultProxyId) {
  el.proxyList.textContent = "";

  if (!proxies.length) {
    el.proxyList.appendChild(createEmptyMessage("Список proxy пока пуст."));
    return;
  }

  for (const proxy of proxies) {
    el.proxyList.appendChild(buildProxyCard(proxy, defaultProxyId));
  }
}

function buildProxyCard(proxy, defaultProxyId) {
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

  const check = document.createElement("p");
  check.className = "muted small";
  check.textContent = proxy.check?.message || "Подключение ещё не проверялось.";

  const checkDetails = document.createElement("p");
  checkDetails.className = "muted small";
  checkDetails.textContent = formatCheckDetails(proxy.check);

  main.append(title, address, meta, check, checkDetails);

  const actions = document.createElement("div");
  actions.className = "proxy-actions";

  const defaultButton = document.createElement("button");
  defaultButton.type = "button";
  defaultButton.className = "proxy-action";
  defaultButton.textContent = proxy.id === defaultProxyId ? "Текущий" : "Сделать основным";
  defaultButton.disabled = proxy.id === defaultProxyId;
  defaultButton.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "proxy:setDefault",
        payload: { id: proxy.id }
      });
      render(resolveViewModelSync(raw));
      setStatus("Proxy по умолчанию обновлён.");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
    }
  });

  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = "ghost";
  testButton.textContent = "Проверить";
  testButton.addEventListener("click", async () => {
    try {
      setStatus("Проверяем подключение...");
      const result = await browser.runtime.sendMessage({
        type: "proxy:test",
        payload: proxy
      });
      await refresh();
      setStatus(result.message, result.status === "error");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
    }
  });

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "ghost";
  editButton.textContent = "Редактировать";
  editButton.addEventListener("click", () => {
    startProxyEdit(proxy);
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.textContent = "Удалить";
  removeButton.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "proxy:remove",
        payload: { id: proxy.id }
      });
      render(resolveViewModelSync(raw));
      setStatus("Proxy удалён.");
    } catch (error) {
      setStatus(error.message || "Ошибка.", true);
    }
  });

  actions.append(defaultButton, testButton, editButton, removeButton);
  card.append(main, actions);
  return card;
}

for (const button of el.tabButtons) {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
}

el.goToAddProxy.addEventListener("click", () => switchTab("proxies"));

el.proxyAuthEnabled.addEventListener("change", () => {
  el.authFields.classList.toggle("hidden", !el.proxyAuthEnabled.checked);
});

el.extensionEnabled.addEventListener("change", async () => {
  try {
    const raw = await browser.runtime.sendMessage({
      type: "extension:setEnabled",
      payload: { enabled: el.extensionEnabled.checked }
    });
    render(resolveViewModelSync(raw));
    setStatus(el.extensionEnabled.checked ? "Proxy включён." : "Proxy выключен.");
  } catch (error) {
    setStatus(error.message || "Ошибка.", true);
  }
});

el.addCurrentSite.addEventListener("click", async () => {
  try {
    const raw = await browser.runtime.sendMessage({ type: "rule:addFromTab" });
    render(resolveViewModelSync(raw));
    setStatus("Сайт добавлен в правила proxy.");
    switchTab("settings");
  } catch (error) {
    setStatus(error.message || "Не удалось добавить сайт.", true);
  }
});

el.proxyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const editingProxyId = el.proxyId.value || null;
    const raw = await browser.runtime.sendMessage({
      type: "proxy:save",
      payload: getProxyPayload()
    });

    const wasEditing = Boolean(editingProxyId);
    resetProxyForm();

    render(resolveViewModelSync(raw));
    const savedProxy = wasEditing
      ? raw.proxies.find((proxy) => proxy.id === editingProxyId)
      : raw.proxies[0];
    const details = savedProxy?.check ? formatCheckDetails(savedProxy.check) : "";
    setStatus(
      details
        ? `${wasEditing ? "Proxy обновлён." : "Proxy сохранён."} ${details}`
        : wasEditing
          ? "Proxy обновлён."
          : "Proxy сохранён."
    );
  } catch (error) {
    setStatus(error.message || "Не удалось сохранить proxy.", true);
  }
});

el.cancelProxyEdit.addEventListener("click", () => {
  resetProxyForm();
  setStatus("Редактирование proxy отменено.");
});

el.proxyType.addEventListener("change", () => {
  if (!el.proxyPort.value) {
    el.proxyPort.value = getDefaultPortForType(el.proxyType.value);
  }
});

el.testProxyButton.addEventListener("click", async () => {
  const payload = getProxyPayload();

  if (!payload.host || !payload.port) {
    setStatus("Заполните host и port перед проверкой.", true);
    return;
  }

  setStatus("Проверяем подключение...");
  el.testProxyButton.disabled = true;

  try {
    const result = await browser.runtime.sendMessage({
      type: "proxy:test",
      payload
    });
    const details = formatCheckDetails(result);
    setStatus(
      details ? `${result.message} ${details}` : result.message,
      result.status === "error"
    );
  } catch (error) {
    setStatus(error.message || "Ошибка при проверке.", true);
  } finally {
    el.testProxyButton.disabled = false;
  }
});

switchTab(activeTabName);
resetProxyForm();

browser.tabs
  .query({ active: true, currentWindow: true })
  .then((tabs) => {
    lastActiveTab = tabs[0] ?? null;
    return refresh();
  })
  .catch((error) => {
    setStatus(error.message || "Не удалось загрузить состояние.", true);
  });
