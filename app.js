/* =========================================================
   Wallet — local finance tracker
   Data persisted to localStorage (JSON) — no server needed.
   ========================================================= */

const STORAGE_KEY = "wallet_data_v1";

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
  currency: "USD",
};

let ui = {
  currentScreen: "home",
  txType: "expense",
  selectedCategoryId: null,
  editingTxId: null,
  txFilter: "all",
  statPeriod: "month",
};

/* ---------------- Storage ---------------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      if (!state.categories) state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    } else {
      seedSampleData();
    }
  } catch (e) {
    console.error("Failed to load state", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedSampleData() {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  state.transactions = [
    { id: uid(), type: "income", amount: 2500, categoryId: "salary", note: "Monthly salary", date: iso(today), createdAt: Date.now() - 1000 },
    { id: uid(), type: "expense", amount: 42.5, categoryId: "food", note: "Groceries", date: iso(today), createdAt: Date.now() - 900 },
    { id: uid(), type: "expense", amount: 15, categoryId: "transport", note: "Uber ride", date: iso(new Date(today - 86400000)), createdAt: Date.now() - 800 },
    { id: uid(), type: "expense", amount: 89.99, categoryId: "shopping", note: "New shoes", date: iso(new Date(today - 2 * 86400000)), createdAt: Date.now() - 700 },
    { id: uid(), type: "expense", amount: 60, categoryId: "bills", note: "Electricity bill", date: iso(new Date(today - 3 * 86400000)), createdAt: Date.now() - 600 },
  ];
  saveState();
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
  container.innerHTML = list.map(t => {
    const cat = getCategory(t.categoryId, t.type);
    const dateLabel = formatDateLabel(t.date);
    return `
      <div class="tx-item" onclick="openEditTx('${t.id}')">
        <div class="tx-icon" style="background:${cat.color}26;color:${cat.color}">${cat.icon}</div>
        <div class="tx-mid">
          <p class="t">${escapeHtml(t.note || cat.name)}</p>
          <p class="s">${cat.name} · ${dateLabel}</p>
        </div>
        <div class="tx-amt ${t.type === "income" ? "in" : "out"}">${t.type === "income" ? "+" : "-"}${fmt(t.amount).replace("-", "")}</div>
      </div>`;
  }).join("");
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- All Transactions + Filter ---------------- */
function renderTxFilterChips() {
  const chips = [{ id: "all", name: "All" }, { id: "income", name: "Income" }, { id: "expense", name: "Expense" }];
  document.getElementById("txFilterChips").innerHTML = chips.map(c =>
    `<div class="chip ${ui.txFilter === c.id ? "active" : ""}" onclick="setTxFilter('${c.id}')">${c.name}</div>`
  ).join("");
}
function setTxFilter(f) { ui.txFilter = f; renderAllTransactions(); }
function openFilterModal() { /* reserved for future use */ toast("Use the filter chips below"); }

function renderAllTransactions() {
  renderTxFilterChips();
  let list = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt);
  if (ui.txFilter !== "all") list = list.filter(t => t.type === ui.txFilter);
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
  const cats = state.categories[ui.txType];
  document.getElementById("addCatGrid").innerHTML = cats.map(c => `
    <div class="cat-cell ${c.id === ui.selectedCategoryId ? "active" : ""}" onclick="selectAddCategory('${c.id}')">
      <div class="ic" style="background:${c.color}26">${c.icon}</div>
      <span>${c.name}</span>
    </div>
  `).join("");
}
function selectAddCategory(id) {
  ui.selectedCategoryId = id;
  renderAddCatGrid();
}

function saveTransaction() {
  const amountRaw = document.getElementById("amountInput").value;
  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    toast("Enter a valid amount");
    return;
  }
  const note = document.getElementById("noteInput").value.trim();
  const date = document.getElementById("dateInput").value || todayISO();

  if (ui.editingTxId) {
    const t = state.transactions.find(x => x.id === ui.editingTxId);
    if (t) {
      t.amount = amount; t.type = ui.txType; t.categoryId = ui.selectedCategoryId;
      t.note = note; t.date = date;
    }
    toast("Transaction updated");
  } else {
    state.transactions.push({
      id: uid(), type: ui.txType, amount, categoryId: ui.selectedCategoryId,
      note, date, createdAt: Date.now()
    });
    toast("Transaction added");
  }
  saveState();
  goTo(ui.editingTxId ? "transactions" : "home");
  ui.editingTxId = null;
}

function confirmDeleteTx() {
  showModal("Delete transaction?", "This action can't be undone.", () => {
    state.transactions = state.transactions.filter(t => t.id !== ui.editingTxId);
    saveState();
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
  expenses.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const ctx = document.getElementById("donutChart").getContext("2d");
  const labels = catEntries.map(([id]) => getCategory(id, "expense").name);
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
          <span class="name">${cat.icon} ${cat.name}</span>
          <span class="amt">${fmt(val)} · ${pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${(val/maxVal*100).toFixed(0)}%; background:${cat.color}"></div></div>
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
}
function categoryRow(c, type) {
  return `
    <div class="manage-row">
      <div class="ic" style="background:${c.color}26;color:${c.color}">${c.icon}</div>
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="del" onclick="confirmDeleteCategory('${c.id}','${type}')">🗑️</div>
    </div>`;
}
function promptAddCategory(type) {
  const name = prompt("Category name:");
  if (!name || !name.trim()) return;
  const icon = prompt("Emoji icon (e.g. 🛒):", "🔘") || "🔘";
  const palette = ["#7C8CFF","#FF6B6B","#33D69F","#F5C542","#5CC8FF","#FF8FD4","#FFA463","#4FD1C5"];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + uid().slice(0, 4);
  state.categories[type].push({ id, name: name.trim(), icon, color });
  saveState();
  renderCategoryManage();
  toast("Category added");
}
function confirmDeleteCategory(id, type) {
  const inUse = state.transactions.some(t => t.categoryId === id);
  showModal(
    "Delete category?",
    inUse ? "Transactions using this category will be marked Uncategorized." : "This action can't be undone.",
    () => {
      state.categories[type] = state.categories[type].filter(c => c.id !== id);
      saveState();
      closeModal();
      renderCategoryManage();
      toast("Category deleted");
    }
  );
}

/* ---------------- Settings: currency / export / import / clear ---------------- */
function changeCurrency() {
  const codes = Object.keys(CURRENCIES);
  const current = codes.indexOf(state.currency);
  const choice = prompt("Currency code (" + codes.join(", ") + "):", state.currency);
  if (choice && CURRENCIES[choice.toUpperCase()]) {
    state.currency = choice.toUpperCase();
    saveState();
    updateCurrencyLabel();
    renderHome();
    toast("Currency updated");
  }
}
function updateCurrencyLabel() {
  document.getElementById("currencyLabel").textContent = `${state.currency} (${currencySymbol()})`;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wallet-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.transactions || !parsed.categories) throw new Error("Invalid file");
      state = parsed;
      saveState();
      toast("Data imported");
      updateCurrencyLabel();
      goTo("home");
    } catch (e) {
      toast("Invalid backup file");
    }
    event.target.value = "";
  };
  reader.readAsText(file);
}

function confirmClearAll() {
  showModal("Clear all data?", "All transactions and categories will be permanently deleted.", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = { transactions: [], categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)), currency: "USD" };
    saveState();
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
function init() {
  loadState();
  updateCurrencyLabel();
  document.getElementById("dateInput").value = todayISO();
  renderAddCatGrid();
  renderHome();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
document.addEventListener("DOMContentLoaded", init);
