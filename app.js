/* =========================================================
   Wallet — local finance tracker
   Data persisted to localStorage (JSON) — no server needed.
   ========================================================= */

//const STORAGE_KEY = "wallet_data_v1";

const DEFAULT_CATEGORIES = {
  expense: [
    { id: "food", name: "Food & Drink", icon: "🍔", color: "#FF6B6B" },
    { id: "transport", name: "Transport", icon: "🚕", color: "#FFA463" },
    { id: "shopping", name: "Shopping", icon: "🛍️", color: "#FF8FD4" },
    { id: "bills", name: "Bills", icon: "🧾", color: "#8B90FF" },
    { id: "health", name: "Health", icon: "💊", color: "#4FD1C5" },
    { id: "entertainment", name: "Fun", icon: "🎬", color: "#F5C542" },
    { id: "home", name: "Home", icon: "🏠", color: "#67B0FF" },
    { id: "other_exp", name: "Other", icon: "🔘", color: "#9AA0AC" },
  ],
  income: [
    { id: "salary", name: "Salary", icon: "💼", color: "#33D69F" },
    { id: "freelance", name: "Freelance", icon: "💻", color: "#5CC8FF" },
    { id: "gift", name: "Gift", icon: "🎁", color: "#FF8FD4" },
    { id: "investment", name: "Investing", icon: "📈", color: "#F5C542" },
    { id: "other_inc", name: "Other", icon: "🔘", color: "#9AA0AC" },
  ],
};

const CURRENCIES = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥", AUD: "A$", CAD: "C$"
};

let state = {
  transactions: [], // {id, type, amount, categoryId, note, date, createdAt}
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  currency: "INR",
};

let ui = {
  currentScreen: "home",
  txType: "expense",
  selectedCategoryId: null,
  editingTxId: null,
  txFilter: "all",
  txSearch: "",
  txCategoryFilter: "all",
  statPeriod: "month",
};

/* ---------------- Storage ---------------- */

async function loadState() {
  try {
    await DB.init();
    state.transactions = await DB.getTransactions();
    state.categories = await DB.getCategories();
    state.currency = await DB.getSetting("currency") || "INR";

    if (state.categories.expense.length === 0) {
      state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      await DB.saveCategories(state.categories);
    }
  } catch (e) {

    console.error("Failed to load state from SQLite", e);
  }
}

async function persistCategories() {
  // Transactions are saved via DB.addTransaction/deleteTransaction
  // Categories are saved via DB.saveCategories
  await DB.saveCategories(state.categories);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- Helpers ---------------- */
function currencySymbol() { return CURRENCIES[state.currency] || "$"; }
function fmt(n) {
  const sign = n < 0 ? "-" : "";
  return sign + currencySymbol() + Math.abs(n).toFixed(2);
}
function getCategory(id, type) {
  const list = state.categories[type] || [];
  return list.find(c => c.id === id) || { name: "Uncategorized", icon: "❓", color: "#9AA0AC" };
}
function allCategoriesFlat() {
  return [...state.categories.expense, ...state.categories.income];
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// Escape text content for HTML insertion
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str == null ? "" : str);
  return div.innerHTML;
}

// Escape for attribute values (data-* / attribute contexts)
function escapeAttr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeText(value, fallback = "", maxLength = 160) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const safe = text.replace(/\s+/g, " ").slice(0, maxLength);
  return safe || fallback;
}

function sanitizeId(value, fallback = "") {
  const base = sanitizeText(value, fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return base || fallback;
}

function sanitizeColor(value, fallback = "#9AA0AC") {
  const safe = sanitizeText(value, fallback);
  return /^#[0-9a-f]{3,8}$/i.test(safe) ? safe : fallback;
}

function normalizeDate(value) {
  if (typeof value !== "string" || !value.trim()) return todayISO();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? todayISO() : d.toISOString().slice(0, 10);
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------------- Navigation ---------------- */
function goTo(screen) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + screen).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const navBtn = document.getElementById("nav-" + screen);
  if (navBtn) navBtn.classList.add("active");
  ui.currentScreen = screen;
  window.scrollTo(0, 0);
  if (screen === "home") renderHome();
  if (screen === "transactions") renderAllTransactions();
  if (screen === "stats") renderStats();
  if (screen === "categories") renderCategoryManage();
}

/* ---------------- Home ---------------- */
function computeTotals(list) {
  let income = 0, expense = 0;
  list.forEach(t => t.type === "income" ? income += t.amount : expense += t.amount);
  return { income, expense, balance: income - expense };
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function renderHome() {
  document.getElementById("greetText").textContent = greetingForNow();
  const totals = computeTotals(state.transactions);
  document.getElementById("homeBalance").innerHTML = `<span>${currencySymbol()}</span>${totals.balance.toFixed(2)}`;
  document.getElementById("homeIncome").textContent = fmt(totals.income);
  document.getElementById("homeExpense").textContent = fmt(totals.expense);

  const recent = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  renderTxList(document.getElementById("homeTxList"), recent);
}

function renderTxList(container, list) {
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="e-ic">💸</div><p><strong>No transactions yet</strong></p><p>Tap the + button to add your first one.</p></div>`;
    return;
  }

  let html = "";
  let lastDate = null;

  list.forEach(t => {
    const dateLabel = formatDateLabel(t.date);
    if (dateLabel !== lastDate) {
      html += `<div class="date-heading">${dateLabel}</div>`;
      lastDate = dateLabel;
    }

    const cat = getCategory(t.categoryId, t.type);
    const safeId = sanitizeId(t.id, "tx");
    html += `
      <div class="tx-item" data-tx-id="${safeId}">
        <div class="tx-icon" style="background:${sanitizeColor(cat.color)}26;color:${sanitizeColor(cat.color)}">${escapeHtml(sanitizeText(cat.icon, "❓", 8))}</div>
        <div class="tx-mid">
          <p class="t">${escapeHtml(sanitizeText(t.note || cat.name, "", 60))}</p>
          <p class="s">${escapeHtml(sanitizeText(cat.name, "Uncategorized", 40))}</p>
        </div>
        <div class="tx-amt ${t.type === "income" ? "in" : "out"}">${t.type === "income" ? "+" : "-"}${fmt(t.amount).replace("-", "")}</div>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.tx-item').forEach((item) => {
    item.addEventListener('click', () => openEditTx(item.getAttribute('data-tx-id')));
  });
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return escapeHtml(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ---------------- All Transactions + Filter ---------------- */
function renderTxFilterChips() {
  const chips = [{ id: "all", name: "All" }, { id: "income", name: "Income" }, { id: "expense", name: "Expense" }];
  const container = document.getElementById("txFilterChips");
  container.innerHTML = chips.map(c =>
    `<div class="chip ${ui.txFilter === c.id ? "active" : ""}" data-filter="${sanitizeId(c.id, "all")}">${escapeHtml(sanitizeText(c.name, c.id, 20))}</div>`
  ).join("");

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => setTxFilter(chip.getAttribute('data-filter')));
  });
}

function renderTxFilters() {
  const catSelect = document.getElementById("txCatFilter");
  if (!catSelect) return;

  const allCats = allCategoriesFlat();
  let html = `<option value="all" ${ui.txCategoryFilter === "all" ? "selected" : ""}>All Categories</option>`;

  allCats.forEach(c => {
    html += `<option value="${escapeAttr(c.id)}" ${ui.txCategoryFilter === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
  });

  catSelect.innerHTML = html;
}

function setTxFilter(f) { ui.txFilter = f; renderAllTransactions(); }
function openFilterModal() { /* reserved for future use */ toast("Use the filter chips below"); }

function renderAllTransactions() {
  renderTxFilterChips();
  renderTxFilters();

  let list = [...state.transactions];

  // 1. Sorting: Latest date first, then latest createdAt
  list.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });

  // 2. Additive Filtering
  // Type filter
  if (ui.txFilter !== "all") {
    list = list.filter(t => t.type === ui.txFilter);
  }

  // Search filter (note or category name)
  if (ui.txSearch) {
    const query = ui.txSearch.toLowerCase();
    list = list.filter(t => {
      const cat = getCategory(t.categoryId, t.type);
      return (t.note && t.note.toLowerCase().includes(query)) ||
             (cat && cat.name.toLowerCase().includes(query));
    });
  }

  // Category filter
  if (ui.txCategoryFilter !== "all") {
    list = list.filter(t => t.categoryId === ui.txCategoryFilter);
  }

  renderTxList(document.getElementById("allTxList"), list);
}

/* ---------------- Add / Edit Transaction ---------------- */
function openAdd() {
  ui.editingTxId = null;
  document.getElementById("addTitle").textContent = "Add Transaction";
  document.getElementById("deleteTxLink").style.display = "none";
  document.getElementById("amountInput").value = "";
  document.getElementById("noteInput").value = "";
  document.getElementById("dateInput").value = todayISO();
  setTxType("expense");
  goTo("add");
}

function openEditTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  ui.editingTxId = id;
  document.getElementById("addTitle").textContent = "Edit Transaction";
  document.getElementById("deleteTxLink").style.display = "block";
  document.getElementById("amountInput").value = t.amount;
  document.getElementById("noteInput").value = t.note || "";
  document.getElementById("dateInput").value = t.date;
  setTxType(t.type, t.categoryId);
  goTo("add");
}

function closeAdd() {
  goTo(ui.editingTxId ? "transactions" : "home");
}

function setTxType(type, presetCategoryId) {
  ui.txType = type;
  document.getElementById("typeExpenseBtn").classList.toggle("active", type === "expense");
  document.getElementById("typeIncomeBtn").classList.toggle("active", type === "income");
  const cats = state.categories[type];
  ui.selectedCategoryId = presetCategoryId || (cats[0] && cats[0].id);
  renderAddCatGrid();
}

function renderAddCatGrid() {
  const cats = state.categories[ui.txType] || [];
  const container = document.getElementById("addCatGrid");
  container.innerHTML = cats.map(c => {
    const safeId = sanitizeId(c.id, "cat");
    return `
      <div class="cat-cell ${c.id === ui.selectedCategoryId ? "active" : ""}" data-cat-id="${safeId}">
        <div class="ic" style="background:${sanitizeColor(c.color)}26">${escapeHtml(sanitizeText(c.icon, "🔘", 8))}</div>
        <span>${escapeHtml(sanitizeText(c.name, "Category", 24))}</span>
      </div>
    `;
  }).join("");

  container.querySelectorAll('.cat-cell').forEach((cell) => {
    cell.addEventListener('click', () => selectAddCategory(cell.getAttribute('data-cat-id')));
  });
}
function selectAddCategory(id) {
  ui.selectedCategoryId = id;
  renderAddCatGrid();
}

async function saveTransaction() {
  const amountRaw = document.getElementById("amountInput").value;
  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    toast("Enter a valid amount");
    return;
  }
  const note = sanitizeText(document.getElementById("noteInput").value, "", 120);
  const date = normalizeDate(document.getElementById("dateInput").value || todayISO());
  const categoryId = state.categories[ui.txType]?.some(c => c.id === ui.selectedCategoryId)
    ? ui.selectedCategoryId
    : state.categories[ui.txType]?.[0]?.id || null;

  const txData = {
    amount: Number(amount.toFixed(2)),
    type: ui.txType,
    categoryId,
    note,
    date
  };

  if (ui.editingTxId) {
    await DB.updateTransaction(ui.editingTxId, txData);
    const t = state.transactions.find(x => x.id === ui.editingTxId);
    if (t) {
      Object.assign(t, txData);
    }
    toast("Transaction updated");
  } else {
    const newTx = {
      id: uid(),
      ...txData,
      createdAt: Date.now()
    };
    await DB.addTransaction(newTx);
    state.transactions.push(newTx);
    toast("Transaction added");
  }
  goTo(ui.editingTxId ? "transactions" : "home");
  ui.editingTxId = null;
}

function confirmDeleteTx() {
  showModal("Delete transaction?", "This action can't be undone.", async () => {
    await DB.deleteTransaction(ui.editingTxId);
    state.transactions = state.transactions.filter(t => t.id !== ui.editingTxId);
    closeModal();
    toast("Transaction deleted");
    ui.editingTxId = null;
    goTo("transactions");
  });
}

/* ---------------- Stats ---------------- */
let donutChartInstance = null;

function setStatPeriod(p) {
  ui.statPeriod = p;
  document.querySelectorAll(".period-tabs button").forEach(b => b.classList.toggle("active", b.dataset.p === p));
  renderStats();
}

function txInPeriod(period) {
  const now = new Date();
  return state.transactions.filter(t => {
    const d = new Date(t.date + "T00:00:00");
    if (period === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
      return d >= start;
    }
    if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (period === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function renderStats() {
  const list = txInPeriod(ui.statPeriod);
  const totals = computeTotals(list);
  document.getElementById("statIncome").textContent = fmt(totals.income);
  document.getElementById("statExpense").textContent = fmt(totals.expense);

  const expenses = list.filter(t => t.type === "expense");
  const byCat = {};
  expenses.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + Number(t.amount || 0); });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const ctx = document.getElementById("donutChart").getContext("2d");
  const labels = catEntries.map(([id]) => escapeHtml(getCategory(id, "expense").name));
  const data = catEntries.map(([, v]) => v);
  const colors = catEntries.map(([id]) => getCategory(id, "expense").color);

  if (donutChartInstance) donutChartInstance.destroy();
  if (!data.length) {
    document.getElementById("catBars").innerHTML = `<div class="empty-state"><div class="e-ic">📊</div><p>No expenses in this period</p></div>`;
    donutChartInstance = new Chart(ctx, { type: "doughnut", data: { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["#1E222B"], borderWidth:0 }] }, options: baseDonutOptions(true) });
    return;
  }
  donutChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, borderRadius: 4 }] },
    options: baseDonutOptions(false)
  });

  const maxVal = Math.max(...data);
  document.getElementById("catBars").innerHTML = catEntries.map(([id, val]) => {
    const cat = getCategory(id, "expense");
    const pct = totals.expense ? ((val / totals.expense) * 100).toFixed(0) : 0;
    return `
      <div class="cat-bar-row">
        <div class="top">
          <span class="name">${escapeHtml(cat.icon)} ${escapeHtml(cat.name)}</span>
          <span class="amt">${fmt(val)} · ${pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${(val/maxVal*100).toFixed(0)}%; background:${escapeAttr(cat.color)}"></div></div>
      </div>`;
  }).join("");
}

function baseDonutOptions(empty) {
  return {
    cutout: "70%",
    plugins: {
      legend: { display: !empty, position: "bottom", labels: { color: "#F2F3F5", boxWidth: 10, padding: 14, font: { size: 11 } } },
      tooltip: { enabled: !empty }
    },
    maintainAspectRatio: true
  };
}

/* ---------------- Categories Management ---------------- */
function renderCategoryManage() {
  document.getElementById("expCatList").innerHTML = state.categories.expense.map(c => categoryRow(c, "expense")).join("");
  document.getElementById("incCatList").innerHTML = state.categories.income.map(c => categoryRow(c, "income")).join("");

  document.querySelectorAll(".manage-row .del").forEach(el => {
    el.onclick = () => confirmDeleteCategory(el.getAttribute("data-id"), el.getAttribute("data-type"));
  });
}
function categoryRow(c, type) {
  return `
    <div class="manage-row">
      <div class="ic" style="background:${escapeAttr(c.color)}26;color:${escapeAttr(c.color)}">${escapeHtml(c.icon)}</div>
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="del" data-id="${escapeAttr(c.id)}" data-type="${escapeAttr(type)}">🗑️</div>
    </div>`;
}
async function promptAddCategory(type) {
  const name = prompt("Category name:");
  if (!name || !name.trim()) return;
  const icon = prompt("Emoji icon (e.g. 🛒):", "🔘") || "🔘";
  const palette = ["#7C8CFF", "#FF6B6B", "#33D69F", "#F5C542", "#5CC8FF", "#FF8FD4", "#FFA463", "#4FD1C5"];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + uid().slice(0, 4);
  state.categories[type].push({ id, name: name.trim(), icon, color });
  await persistCategories();
  renderCategoryManage();
  toast("Category added");
}
function confirmDeleteCategory(id, type) {
  const inUse = state.transactions.some(t => t.categoryId === id);
  showModal(
    "Delete category?",
    inUse ? "Transactions using this category will be marked Uncategorized." : "This action can't be undone.",
    async () => {
      state.categories[type] = state.categories[type].filter(c => c.id !== id);
      state.transactions = state.transactions.map(t => t.categoryId === id ? { ...t, categoryId: null } : t);
      await persistCategories();
      closeModal();
      renderCategoryManage();
      renderHome();
      renderAllTransactions();
      toast("Category deleted");
    }
  );
}

/* ---------------- Settings: currency / export / import / clear ---------------- */
async function changeCurrency() {
  const codes = Object.keys(CURRENCIES);
  const current = codes.indexOf(state.currency);
  const choice = prompt("Currency code (" + codes.join(", ") + "):", state.currency);
  if (choice && CURRENCIES[choice.toUpperCase()]) {
    state.currency = choice.toUpperCase();
    await DB.saveSetting("currency", state.currency);
    updateCurrencyLabel();
    renderHome();
    toast("Currency updated");
  }
}
function updateCurrencyLabel() {
  document.getElementById("currencyLabel").textContent = `${state.currency} (${currencySymbol()})`;
  const cur = document.getElementById("curSymbol");
  if (cur) cur.textContent = currencySymbol();
}

async function changeGeminiKey() {
  const hasExisting = !!(await DB.getSetting("geminiKeyCipher"));
  const action = hasExisting
    ? prompt('Type "change" to replace your saved key, or "clear" to remove it:', "change")
    : "change";
  if (action === null) return;

  if (action.trim().toLowerCase() === "clear") {
    await DB.saveSetting("geminiKeyCipher", "");
    await DB.saveSetting("geminiKeySalt", "");
    await DB.saveSetting("geminiKeyIv", "");
    CryptoVault.clearSession();
    await updateGeminiKeyLabel();
    toast("Gemini key removed");
    return;
  }

  const key = prompt("Paste your Gemini API key (from aistudio.google.com):");
  if (key === null || !key.trim()) return;

  const passphrase = prompt(
    "Choose a passphrase to encrypt it. You'll need this each session to use voice add:"
  );
  if (!passphrase) {
    toast("A passphrase is required to store the key securely");
    return;
  }

  const { saltB64 } = await CryptoVault.initVault(passphrase);
  const { ivB64, cipherB64 } = await CryptoVault.encrypt(key.trim());

  await DB.saveSetting("geminiKeyCipher", cipherB64);
  await DB.saveSetting("geminiKeySalt", saltB64);
  await DB.saveSetting("geminiKeyIv", ivB64);

  await updateGeminiKeyLabel();
  toast("Gemini key encrypted and saved");
}

async function updateGeminiKeyLabel() {
  const label = document.getElementById("geminiKeyLabel");
  if (!label) return;
  const cipher = await DB.getSetting("geminiKeyCipher");
  if (!cipher) {
    label.textContent = "Not set — voice add disabled";
    return;
  }
  label.textContent = CryptoVault.hasSessionKey()
    ? "Encrypted & unlocked (tap to change)"
    : "Encrypted — locked (tap to change or unlock via voice add)";
}

async function downloadDatabase() {
  try {
    const data = await DB.exportFile();
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-${todayISO()}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("wallet.db downloaded");
  } catch (e) {
    console.error(e);
    toast("Download failed");
  }
}

function uploadDatabase() {
  document.getElementById("uploadDbFile").click();
}

async function restoreDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;
  showModal("Restore database?", "This will replace all current data with the contents of the .db file.", async () => {
    try {
      const buf = await file.arrayBuffer();
      await DB.importFile(buf);
      state.transactions = await DB.getTransactions();
      state.categories = await DB.getCategories();
      closeModal();
      updateCurrencyLabel();
      renderHome();
      toast("Database restored");
    } catch (e) {
      closeModal();
      toast("Invalid .db file");
    }
    event.target.value = "";
  });
}

function confirmClearAll() {
  showModal("Clear all data?", "All transactions and categories will be permanently deleted.", async () => {
    // Use DB.clearAll() instead of localStorage.removeItem
    await DB.clearAll();
    state = { transactions: [], categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)), currency: "INR" };
    await persistCategories();
    closeModal();
    updateCurrencyLabel();
    toast("All data cleared");
    goTo("home");
  });
}

/* ---------------- Modal ---------------- */
function showModal(title, text, onConfirm) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalText").textContent = text;
  const btn = document.getElementById("modalConfirmBtn");
  btn.onclick = onConfirm;
  document.getElementById("modalBackdrop").classList.add("show");
}
function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("show");
}

/* ---------------- Init ---------------- */
function setupEventListeners() {
  // Navigation
  document.getElementById("btn-settings")?.addEventListener("click", () => goTo("settings"));
  document.getElementById("link-all-tx")?.addEventListener("click", () => goTo("transactions"));
  document.getElementById("btn-filter")?.addEventListener("click", openFilterModal);
  document.getElementById("btn-nav-add")?.addEventListener("click", openAdd);
  document.getElementById("nav-home")?.addEventListener("click", () => goTo("home"));
  document.getElementById("nav-transactions")?.addEventListener("click", () => goTo("transactions"));
  document.getElementById("nav-stats")?.addEventListener("click", () => goTo("stats"));
  document.getElementById("nav-categories")?.addEventListener("click", () => goTo("categories"));

  // Transaction Filters
  document.getElementById("txSearchInput")?.addEventListener("input", (e) => {
    ui.txSearch = e.target.value;
    renderAllTransactions();
  });
  document.getElementById("txCatFilter")?.addEventListener("change", (e) => {
    ui.txCategoryFilter = e.target.value;
    renderAllTransactions();
  });

  // Add / Edit Screen
  document.getElementById("btn-close-add")?.addEventListener("click", closeAdd);
  document.getElementById("btn-save-tx")?.addEventListener("click", saveTransaction);
  document.getElementById("deleteTxLink")?.addEventListener("click", confirmDeleteTx);
  document.getElementById("typeExpenseBtn")?.addEventListener("click", () => setTxType("expense"));
  document.getElementById("typeIncomeBtn")?.addEventListener("click", () => setTxType("income"));

  // Stats Screen
  document.querySelectorAll(".period-tabs button").forEach(btn => {
    btn.addEventListener("click", () => setStatPeriod(btn.dataset.p));
  });

  // Categories Screen
  document.querySelectorAll(".add-cat-btn").forEach(btn => {
    btn.addEventListener("click", () => promptAddCategory(btn.dataset.type));
  });

  // Settings Screen
  document.getElementById("row-manage-cats")?.addEventListener("click", () => goTo("categories"));
  document.getElementById("row-download-db")?.addEventListener("click", downloadDatabase);
  document.getElementById("row-upload-db")?.addEventListener("click", uploadDatabase);
  document.getElementById("uploadDbFile")?.addEventListener("change", restoreDatabase);
  document.getElementById("row-currency")?.addEventListener("click", changeCurrency);
  document.getElementById("row-gemini-key")?.addEventListener("click", changeGeminiKey);
  document.getElementById("row-clear-all")?.addEventListener("click", confirmClearAll);
  document.getElementById("btn-voice-add")?.addEventListener("click", () => window.VoiceEntry?.open());

  // Modal
  document.getElementById("btn-modal-cancel")?.addEventListener("click", closeModal);
}

async function init() {
  setupEventListeners();
  await loadState();

  updateCurrencyLabel();
  updateGeminiKeyLabel();
  document.getElementById("dateInput").value = todayISO();
  renderAddCatGrid();
  renderHome();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  window.addEventListener("pagehide", flushOnExit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnExit();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => { console.warn("SW registration failed:", err); });
  }
}

function flushOnExit() {
  DB.flush().catch((err) => console.error("Failed to flush DB on exit:", err));
}
document.addEventListener("DOMContentLoaded", init);
