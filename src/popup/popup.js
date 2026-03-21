import { resolveViewModel } from "./state.js";

function t(key, substitutions) {
  return browser.i18n.getMessage(key, substitutions) || key;
}

function applyLocalization() {
  document.documentElement.lang = browser.i18n.getUILanguage();

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }

  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }

  for (const node of document.querySelectorAll("[data-i18n-title]")) {
    node.title = t(node.dataset.i18nTitle);
  }

  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }

  document.title = t("popupTitle");
}

/* ── Element refs ───────────────────────────────────── */
const el = {
  tabButtons:       Array.from(document.querySelectorAll("[data-tab]")),
  tabPanels:        Array.from(document.querySelectorAll("[data-tab-panel]")),
  extensionEnabled: document.getElementById("extension-enabled"),
  siteCard:         document.getElementById("site-card"),
  siteDot:          document.getElementById("site-dot"),
  currentSite:      document.getElementById("current-site"),
  currentMode:      document.getElementById("current-mode"),
  noProxyState:     document.getElementById("no-proxy-state"),
  homeActions:      document.getElementById("home-actions"),
  goToAddProxy:     document.getElementById("go-to-add-proxy"),
  addCurrentSite:   document.getElementById("add-current-site"),
  activeProxyLabel: document.getElementById("active-proxy-label"),
  proxyErrorCard:   document.getElementById("proxy-error-card"),
  proxyErrorText:   document.getElementById("proxy-error-text"),
  proxyDecisionCard:document.getElementById("proxy-decision-card"),
  proxyDecisionText:document.getElementById("proxy-decision-text"),
  suggestedHosts:   document.getElementById("suggested-hosts"),
  templateList:     document.getElementById("template-list"),
  manualRuleForm:   document.getElementById("manual-rule-form"),
  manualRuleHost:   document.getElementById("manual-rule-host"),
  manualRuleSubmit: document.getElementById("manual-rule-submit"),
  rulesList:        document.getElementById("rules-list"),
  proxyForm:        document.getElementById("proxy-form"),
  proxyId:          document.getElementById("proxy-id"),
  proxyFormMode:    document.getElementById("proxy-form-mode"),
  proxyFormModeText:document.getElementById("proxy-form-mode-text"),
  proxyName:        document.getElementById("proxy-name"),
  proxyType:        document.getElementById("proxy-type"),
  proxyHost:        document.getElementById("proxy-host"),
  proxyPort:        document.getElementById("proxy-port"),
  proxyAuthEnabled: document.getElementById("proxy-auth-enabled"),
  authFields:       document.getElementById("auth-fields"),
  proxyUsername:    document.getElementById("proxy-username"),
  proxyPassword:    document.getElementById("proxy-password"),
  cancelProxyEdit:  document.getElementById("cancel-proxy-edit"),
  proxySubmit:      document.getElementById("proxy-submit"),
  testProxyButton:  document.getElementById("test-proxy-form"),
  proxyList:        document.getElementById("proxy-list"),
  defaultProxyLabel:document.getElementById("default-proxy-label"),
  status:           document.getElementById("status"),
};

/* ── Status helper ──────────────────────────────────── */
let statusTimer;

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("is-error", isError);
  el.status.classList.toggle("is-ok", !isError && Boolean(message));
  clearTimeout(statusTimer);
  if (message) {
    statusTimer = setTimeout(() => {
      el.status.textContent = "";
      el.status.classList.remove("is-error", "is-ok");
    }, 4000);
  }
}

/* ── Tab switching ──────────────────────────────────── */
let activeTabName = "home";

function switchTab(tabName) {
  activeTabName = tabName;
  for (const btn of el.tabButtons) {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  }
  for (const panel of el.tabPanels) {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabName);
  }
}

/* ── Port defaults ──────────────────────────────────── */
const DEFAULT_PORTS = { http: "80", https: "443", socks: "1080", socks4: "1080" };
let lastProxyType = "https";
const RULE_TEMPLATES = [
  {
    id: "youtube",
    titleKey: "templateYoutubeTitle",
    values: ["youtube.com", "www.youtube.com"]
  },
  {
    id: "discord",
    titleKey: "templateDiscordTitle",
    values: ["discord.com", "www.discord.com"]
  },
  {
    id: "ai",
    titleKey: "templateAiTitle",
    values: [
      "openai.com",
      "chatgpt.com",
      "x.ai",
      "grok.com",
      "github.com",
      "claude.ai",
      "claude.com",
      "gemini.google.com"
    ]
  }
];

function getDefaultPort(type) {
  return DEFAULT_PORTS[type] ?? "443";
}

/* ── Proxy form helpers ─────────────────────────────── */
function getProxyPayload() {
  return {
    id:          el.proxyId.value || undefined,
    name:        el.proxyName.value,
    type:        el.proxyType.value,
    host:        el.proxyHost.value,
    port:        el.proxyPort.value,
    authEnabled: el.proxyAuthEnabled.checked,
    username:    el.proxyUsername.value,
    password:    el.proxyPassword.value,
  };
}

function resetProxyForm() {
  el.proxyForm.reset();
  el.proxyId.value = "";
  el.proxyType.value = "https";
  el.proxyPort.value = getDefaultPort("https");
  lastProxyType = "https";
  el.proxyAuthEnabled.checked = false;
  el.authFields.classList.add("hidden");
  el.proxyFormMode.classList.add("hidden");
  el.cancelProxyEdit.classList.add("hidden");
  el.proxySubmit.disabled = false;
}

function startProxyEdit(proxy) {
  el.proxyId.value = proxy.id;
  el.proxyName.value = proxy.name || "";
  el.proxyType.value = proxy.type || "https";
  lastProxyType = proxy.type || "https";
  el.proxyHost.value = proxy.host || "";
  el.proxyPort.value = String(proxy.port || getDefaultPort(proxy.type));
  el.proxyAuthEnabled.checked = Boolean(proxy.authEnabled);
  el.proxyUsername.value = proxy.username || "";
  el.proxyPassword.value = proxy.password || "";
  el.authFields.classList.toggle("hidden", !proxy.authEnabled);
  el.proxyFormMode.classList.remove("hidden");
  el.cancelProxyEdit.classList.remove("hidden");
  el.proxyFormModeText.textContent = proxy.name;
  switchTab("proxies");
}

/* ── State helpers ──────────────────────────────────── */
let lastActiveTab = null;

async function fetchViewModel() {
  const [rawState, tabs] = await Promise.all([
    browser.runtime.sendMessage({ type: "state:get" }),
    browser.tabs.query({ active: true, currentWindow: true }),
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

/* ── Render ─────────────────────────────────────────── */
function render(vm) {
  // Header toggle
  el.extensionEnabled.checked = Boolean(vm.enabled && vm.hasProxy);
  el.extensionEnabled.disabled = !vm.hasProxy;

  // Site card
  el.currentSite.textContent = vm.activeTab?.hostname || t("noActiveTab");
  el.currentMode.textContent = vm.activeRuleId
    ? t("routeMode", [vm.activeProxyName || t("defaultProxyFallback"), formatRuleTarget(vm.activeRule)])
    : t("noRuleForSite");
  el.siteCard.classList.toggle("is-proxied", Boolean(vm.activeRuleId && vm.enabled));

  // Home actions visibility
  el.noProxyState.classList.toggle("hidden", vm.hasProxy);
  el.homeActions.classList.toggle("hidden", !vm.hasProxy);
  el.addCurrentSite.disabled = !vm.activeTab || !vm.hasProxy;

  // Default proxy label
  el.activeProxyLabel.textContent = vm.defaultProxyName ?? t("notSelected");
  el.defaultProxyLabel.textContent = vm.defaultProxyName
    ? t("defaultProxyWithName", vm.defaultProxyName)
    : t("defaultProxyNotSelected");

  // Error / decision cards
  el.proxyErrorCard.classList.toggle("hidden", !vm.lastProxyError);
  el.proxyErrorText.textContent = vm.lastProxyError || "";
  el.proxyDecisionCard.classList.toggle("hidden", !vm.lastProxyDecision);
  el.proxyDecisionText.textContent = formatProxyDecision(vm.lastProxyDecision);

  renderSuggestedHosts(vm.suggestedHosts);
  renderTemplates();
  renderRules(vm.rules, vm.proxies);
  renderProxies(vm.proxies, vm.defaultProxyId);
}

function renderTemplates() {
  el.templateList.textContent = "";

  for (const template of RULE_TEMPLATES) {
    const card = document.createElement("div");
    card.className = "template-card";

    const meta = document.createElement("div");
    meta.className = "template-meta";

    const title = document.createElement("div");
    title.className = "template-title";
    title.textContent = t(template.titleKey);

    const hosts = document.createElement("div");
    hosts.className = "template-hosts";
    hosts.textContent = template.values.join(", ");

    meta.append(title, hosts);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn btn-sm btn-primary";
    addButton.textContent = "+";
    addButton.title = t("addTemplateTitle", t(template.titleKey));
    addButton.addEventListener("click", async () => {
      try {
        const raw = await browser.runtime.sendMessage({
          type: "rule:addTemplate",
          payload: { values: template.values },
        });
        render(resolveViewModelSync(raw));
        setStatus(t("templateAdded", t(template.titleKey)));
      } catch (err) {
        setStatus(err.message || t("templateAddFailed"), true);
      }
    });

    card.append(meta, addButton);
    el.templateList.appendChild(card);
  }
}

function renderSuggestedHosts(hosts) {
  el.suggestedHosts.textContent = "";
  if (!hosts.length) {
    const li = document.createElement("li");
    li.className = "chip-empty";
    li.textContent = t("nothingObserved");
    el.suggestedHosts.appendChild(li);
    return;
  }
  for (const host of hosts) {
    const li = document.createElement("li");
    li.className = "chip";
    li.textContent = host;
    el.suggestedHosts.appendChild(li);
  }
}

/* ── Rule tiles ─────────────────────────────────────── */
function renderRules(rules, proxies) {
  el.rulesList.textContent = "";
  if (!rules.length) {
    el.rulesList.appendChild(emptyMsg(t("noRulesEmpty")));
    return;
  }
  for (const rule of rules) {
    el.rulesList.appendChild(buildRuleTile(rule, proxies));
  }
}

function buildRuleTile(rule, proxies) {
  const tile = document.createElement("article");
  tile.className = "rule-tile";

  // ── header row
  const header = document.createElement("div");
  header.className = "rule-tile-header";

  const left = document.createElement("div");

  const hostname = document.createElement("span");
  hostname.className = "rule-hostname";

  const dot = document.createElement("span");
  dot.className = `rule-dot ${rule.enabled ? "on" : "off"}`;
  hostname.appendChild(dot);
  hostname.append(formatRuleTarget(rule));

  const proxyLabel = document.createElement("p");
  proxyLabel.className = "rule-proxy-label";
  proxyLabel.textContent = rule.proxyName
    ? t("proxyWithName", rule.proxyName)
    : t("defaultProxyWithName", rule.effectiveProxyName || "—");

  left.append(hostname, proxyLabel);

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "rule-expand";
  expandBtn.textContent = "···";
  expandBtn.title = t("ruleSettingsTitle");

  header.append(left, expandBtn);

  // ── menu (hidden by default)
  const menu = document.createElement("div");
  menu.className = "rule-menu hidden";

  // proxy select row
  const proxyRow = document.createElement("div");
  proxyRow.className = "rule-proxy-row";

  const proxySelect = document.createElement("select");
  const defOption = document.createElement("option");
  defOption.value = "";
  defOption.textContent = t("defaultOption");
  proxySelect.appendChild(defOption);
  for (const px of proxies) {
    const opt = document.createElement("option");
    opt.value = px.id;
    opt.textContent = px.name;
    proxySelect.appendChild(opt);
  }
  proxySelect.value = rule.proxyId || "";

  const saveProxyBtn = document.createElement("button");
  saveProxyBtn.type = "button";
  saveProxyBtn.className = "btn btn-sm btn-ghost";
  saveProxyBtn.textContent = t("saveButton");
  saveProxyBtn.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "rule:setProxy",
        payload: { id: rule.id, proxyId: proxySelect.value || null },
      });
      render(resolveViewModelSync(raw));
      setStatus(t("ruleProxyUpdated"));
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    }
  });

  proxyRow.append(proxySelect, saveProxyBtn);

  // actions row
  const actionsRow = document.createElement("div");
  actionsRow.className = "proxy-actions-row";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "btn btn-sm btn-ghost";
  toggleBtn.textContent = rule.enabled ? t("disableButton") : t("enableButton");
  toggleBtn.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "rule:toggle",
        payload: { id: rule.id, enabled: !rule.enabled },
      });
      render(resolveViewModelSync(raw));
      setStatus(t("ruleUpdated"));
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-sm btn-danger";
  deleteBtn.textContent = t("deleteButton");
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(t("confirmDeleteRule", rule.label || rule.matchHost))) return;
    try {
      const raw = await browser.runtime.sendMessage({
        type: "rule:remove",
        payload: { id: rule.id },
      });
      render(resolveViewModelSync(raw));
      setStatus(t("ruleDeleted"));
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    }
  });

  actionsRow.append(toggleBtn, deleteBtn);
  menu.append(proxyRow, actionsRow);

  // expand toggle
  expandBtn.addEventListener("click", () => {
    const isOpen = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden", isOpen);
    tile.classList.toggle("open", !isOpen);
  });

  tile.append(header, menu);
  return tile;
}

/* ── Proxy cards ────────────────────────────────────── */
function renderProxies(proxies, defaultProxyId) {
  el.proxyList.textContent = "";
  if (!proxies.length) {
    el.proxyList.appendChild(emptyMsg(t("noProxiesEmpty")));
    return;
  }
  for (const proxy of proxies) {
    el.proxyList.appendChild(buildProxyCard(proxy, defaultProxyId));
  }
}

function buildProxyCard(proxy, defaultProxyId) {
  const card = document.createElement("article");
  card.className = "proxy-card";

  // header
  const header = document.createElement("div");
  header.className = "proxy-card-header";

  const name = document.createElement("span");
  name.className = "proxy-card-name";
  name.textContent = proxy.name;

  const addr = document.createElement("span");
  addr.className = "proxy-card-addr";
  addr.textContent = `${proxy.type.toUpperCase()} ${proxy.host}:${proxy.port}`;

  header.append(name, addr);

  // meta badges
  const meta = document.createElement("div");
  meta.className = "proxy-card-meta";

  if (proxy.id === defaultProxyId) meta.appendChild(badge(t("defaultBadge"), "badge-default"));
  if (proxy.authEnabled)          meta.appendChild(badge(t("authBadge"), "badge-auth"));

  const checkStatus = proxy.check?.status ?? "idle";
  if (checkStatus === "success") meta.appendChild(badge(t("okBadge"), "badge-success"));
  else if (checkStatus === "error") meta.appendChild(badge(t("errorBadge"), "badge-error"));
  else meta.appendChild(badge(t("notTestedBadge"), "badge-idle"));

  // check message
  const checkMsg = document.createElement("p");
  checkMsg.className = "proxy-check-msg";
  checkMsg.textContent = proxy.check?.message || t("proxyNeverTested");

  const checkIps = document.createElement("p");
  checkIps.className = "proxy-check-ips";
  checkIps.textContent = formatCheckIps(proxy.check);

  // actions
  const actions = document.createElement("div");
  actions.className = "proxy-actions-row";

  const defaultBtn = document.createElement("button");
  defaultBtn.type = "button";
  defaultBtn.className = "btn btn-sm btn-ghost";
  defaultBtn.textContent = proxy.id === defaultProxyId ? t("primaryButtonActive") : t("makePrimaryButton");
  defaultBtn.disabled = proxy.id === defaultProxyId;
  defaultBtn.addEventListener("click", async () => {
    try {
      const raw = await browser.runtime.sendMessage({
        type: "proxy:setDefault",
        payload: { id: proxy.id },
      });
      render(resolveViewModelSync(raw));
      setStatus(t("defaultProxyUpdated"));
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    }
  });

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "btn btn-sm btn-ghost";
  testBtn.textContent = t("testButton");
  testBtn.addEventListener("click", async () => {
    try {
      setStatus(t("testingConnection"));
      testBtn.disabled = true;
      const result = await browser.runtime.sendMessage({ type: "proxy:test", payload: proxy });
      await refresh();
      setStatus(result.message, result.status === "error");
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    } finally {
      testBtn.disabled = false;
    }
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-sm btn-ghost";
  editBtn.textContent = t("editButton");
  editBtn.addEventListener("click", () => startProxyEdit(proxy));

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-sm btn-danger";
  removeBtn.textContent = t("deleteButton");
  removeBtn.addEventListener("click", async () => {
    if (!confirm(t("confirmDeleteProxy", proxy.name))) return;
    try {
      const raw = await browser.runtime.sendMessage({
        type: "proxy:remove",
        payload: { id: proxy.id },
      });
      render(resolveViewModelSync(raw));
      setStatus(t("proxyDeleted"));
    } catch (err) {
      setStatus(err.message || t("genericError"), true);
    }
  });

  actions.append(defaultBtn, testBtn, editBtn, removeBtn);
  card.append(header, meta, checkMsg, checkIps, actions);
  return card;
}

/* ── Format helpers ─────────────────────────────────── */
function formatCheckIps(check) {
  const parts = [];
  if (check?.directIp) parts.push(t("directIpLabel", check.directIp));
  if (check?.proxyIp)  parts.push(t("proxyIpLabel", check.proxyIp));
  return parts.join("  ·  ");
}

function formatRuleTarget(rule) {
  if (!rule) {
    return "";
  }

  return `${rule.matchHost || rule.label || ""}${rule.pathPrefix || ""}`;
}

function formatProxyDecision(decision) {
  if (!decision) return "";
  const parts = [];
  if (decision.scope === "test") parts.push(t("testScope"));
  if (decision.matchedRuleHost)  parts.push(`rule=${decision.matchedRuleHost}`);
  if (decision.proxyHost)        parts.push(`${decision.proxyType?.toUpperCase()} ${decision.proxyHost}:${decision.proxyPort}`);
  if (decision.url)              parts.push(decision.url);
  return parts.join("  ·  ");
}

function badge(text, cls) {
  const span = document.createElement("span");
  span.className = `badge ${cls}`;
  span.textContent = text;
  return span;
}

function emptyMsg(text) {
  const div = document.createElement("div");
  div.className = "empty-msg";
  div.textContent = text;
  return div;
}

/* ── Event listeners ────────────────────────────────── */
for (const btn of el.tabButtons) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

el.goToAddProxy.addEventListener("click", () => switchTab("proxies"));

el.proxyAuthEnabled.addEventListener("change", () => {
  el.authFields.classList.toggle("hidden", !el.proxyAuthEnabled.checked);
});

el.extensionEnabled.addEventListener("change", async () => {
  try {
    const raw = await browser.runtime.sendMessage({
      type: "extension:setEnabled",
      payload: { enabled: el.extensionEnabled.checked },
    });
    render(resolveViewModelSync(raw));
      setStatus(el.extensionEnabled.checked ? t("proxyEnabled") : t("proxyDisabled"));
  } catch (err) {
    setStatus(err.message || t("genericError"), true);
  }
});

el.addCurrentSite.addEventListener("click", async () => {
  try {
    const raw = await browser.runtime.sendMessage({ type: "rule:addFromTab" });
    render(resolveViewModelSync(raw));
    setStatus(t("siteAddedToRules"));
    switchTab("settings");
  } catch (err) {
    setStatus(err.message || t("siteAddFailed"), true);
  }
});

el.manualRuleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const value = el.manualRuleHost.value.trim();

  if (!value) {
    setStatus(t("enterSiteOrUrl"), true);
    return;
  }

  el.manualRuleSubmit.disabled = true;

  try {
    const raw = await browser.runtime.sendMessage({
      type: "rule:addManual",
      payload: { value },
    });
    el.manualRuleHost.value = "";
    render(resolveViewModelSync(raw));
    setStatus(t("manualRuleAdded"));
  } catch (err) {
    setStatus(err.message || t("siteAddFailed"), true);
  } finally {
    el.manualRuleSubmit.disabled = false;
  }
});

// BUG FIX: Disable submit during save (proxy test takes up to 12s)
el.proxyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editingId = el.proxyId.value || null;

  el.proxySubmit.disabled = true;
  el.proxySubmit.textContent = t("checkingButton");

  try {
    const raw = await browser.runtime.sendMessage({
      type: "proxy:save",
      payload: getProxyPayload(),
    });
    const wasEditing = Boolean(editingId);
    resetProxyForm();
    render(resolveViewModelSync(raw));
    const saved = wasEditing
      ? raw.proxies.find((p) => p.id === editingId)
      : raw.proxies[0];
    const ips = saved?.check ? formatCheckIps(saved.check) : "";
    setStatus(
      [wasEditing ? t("proxyUpdated") : t("proxySaved"), ips].filter(Boolean).join("  ")
    );
  } catch (err) {
    setStatus(err.message || t("saveFailed"), true);
  } finally {
    el.proxySubmit.disabled = false;
    el.proxySubmit.textContent = t("saveButton");
  }
});

el.cancelProxyEdit.addEventListener("click", () => {
  resetProxyForm();
  setStatus(t("editCancelled"));
});

// BUG FIX: Update port only if it matches the default for the PREVIOUS type
el.proxyType.addEventListener("change", () => {
  const prevDefault = DEFAULT_PORTS[lastProxyType];
  const nextType = el.proxyType.value;
  if (!el.proxyPort.value || el.proxyPort.value === prevDefault) {
    el.proxyPort.value = DEFAULT_PORTS[nextType];
  }
  lastProxyType = nextType;
});

el.testProxyButton.addEventListener("click", async () => {
  const payload = getProxyPayload();
  if (!payload.host || !payload.port) {
    setStatus(t("enterHostAndPort"), true);
    return;
  }
  setStatus(t("testingConnection"));
  el.testProxyButton.disabled = true;
  try {
    const result = await browser.runtime.sendMessage({ type: "proxy:test", payload });
    const ips = formatCheckIps(result);
    setStatus([result.message, ips].filter(Boolean).join("  "), result.status === "error");
  } catch (err) {
    setStatus(err.message || t("testFailed"), true);
  } finally {
    el.testProxyButton.disabled = false;
  }
});

/* ── Init ───────────────────────────────────────────── */
applyLocalization();
switchTab(activeTabName);
resetProxyForm();

browser.tabs
  .query({ active: true, currentWindow: true })
  .then((tabs) => {
    lastActiveTab = tabs[0] ?? null;
    return refresh();
  })
  .catch((err) => setStatus(err.message || t("loadStateFailed"), true));
