const STORAGE_KEY = 'wallet_sqlite_db';
const IDB_NAME = 'WalletDB';
const IDB_STORE = 'settings';
let db = null;
let dbPromise = null;
let SQL = null;
let saveQueue = Promise.resolve();
let opfsAvailable = null; // null = unknown

async function checkOpfs() {
  if (opfsAvailable !== null) return opfsAvailable;
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      await navigator.storage.getDirectory();
      opfsAvailable = true;
    } else {
      opfsAvailable = false;
    }
  } catch (e) {
    opfsAvailable = false;
  }
  return opfsAvailable;
}

// OPFS: real wallet.db file in app-private device storage (auto load/save)
async function opfsWrite(data) {
  if (!(await checkOpfs())) return;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle("wallet.db", { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  } catch (e) {
    console.warn("OPFS save skipped:", e);
  }
}

async function opfsRead() {
  if (!(await checkOpfs())) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle("wallet.db");
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    return buf.byteLength ? new Uint8Array(buf) : null;
  } catch (e) {
    return null; // not found or not supported
  }
}

function openIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

// Helper to handle binary storage in IndexedDB (Replaces localStorage)
const store = {
  async save(data) {
    const idb = await openIDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(data, STORAGE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    } finally {
      idb.close();
    }
  },
  async get() {
    const idb = await openIDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error);
      });
    } finally {
      idb.close();
    }
  }
};

function initDB() {
  if (db) return Promise.resolve(db);
  if (!dbPromise) {
    dbPromise = (async () => {
      SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });

      const savedDb = (await opfsRead()) || (await store.get()); // Async retrieval
      if (savedDb) {
        try {
          // savedDb is already a Uint8Array from IndexedDB, no JSON.parse needed
          db = new SQL.Database(new Uint8Array(savedDb));
          migrateTables();
        } catch (e) {
          console.error("Failed to restore DB, creating new one", e);
          db = new SQL.Database();
          setupTables();
        }
      } else {
        db = new SQL.Database();
        setupTables();
      }
      return db;
    })();
  }
  return dbPromise;
}

function setupTables() {
  db.run(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, type TEXT, icon TEXT, color TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, amount REAL, type TEXT, categoryId TEXT, note TEXT, date TEXT, createdAt INTEGER)`);
  migrateTables();
}

function migrateTables() {
  const res = db.exec("PRAGMA table_info(categories)");
  const cols = res.length ? res[0].values.map(v => v[1]) : [];
  if (cols.includes("id") && !cols.includes("color")) {
    db.run("ALTER TABLE categories ADD COLUMN color TEXT");
  }
}

async function persistDB() {
  if (!db) return;
  const data = db.export();
  // Store as raw binary Uint8Array instead of JSON string
  saveQueue = saveQueue.then(async () => {
    await opfsWrite(data); // auto-save real wallet.db file (best effort)
    await store.save(data); // IndexedDB guarantee
  });
  return saveQueue;
}

const DB = {
  async init() {
    return await initDB();
  },

  flush: async () => {
    await saveQueue;
  },
  
  getTransactions: async () => {
    if (!db) await DB.init();
    const res = db.exec("SELECT * FROM transactions ORDER BY createdAt DESC");
    if (!res.length) return [];
    return res[0].values.map(v => ({
      id: v[0], amount: v[1], type: v[2], categoryId: v[3],
      note: v[4], date: v[5], createdAt: v[6]
    }));
  },

  addTransaction: async (tx) => {
    if (!db) await DB.init();
    const stmt = db.prepare("INSERT INTO transactions (id, amount, type, categoryId, note, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run([tx.id, tx.amount, tx.type, tx.categoryId, tx.note, tx.date, tx.createdAt]);
    stmt.free();
    await persistDB(); // Now async
  },

  deleteTransaction: async (id) => {
    if (!db) await DB.init();
    const stmt = db.prepare("DELETE FROM transactions WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    await persistDB(); // Now async
  },

  updateTransaction: async (id, tx) => {
    if (!db) await DB.init();
    const stmt = db.prepare("UPDATE transactions SET amount = ?, type = ?, categoryId = ?, note = ?, date = ? WHERE id = ?");
    stmt.run([tx.amount, tx.type, tx.categoryId, tx.note, tx.date, id]);
    stmt.free();
    await persistDB(); // Now async
  },

  getCategories: async () => {
    if (!db) await DB.init();
    const res = db.exec("SELECT * FROM categories");
    if (!res.length) return { expense: [], income: [] };
    const all = res[0].values.map(v => ({ id: v[0], name: v[1], type: v[2], icon: v[3], color: v[4] || null }));
    return {
      expense: all.filter(c => c.type === 'expense'),
      income: all.filter(c => c.type === 'income')
    };
  },

  saveCategories: async (categories) => {
    if (!db) await DB.init();
    db.run("DELETE FROM categories");
    const exp = categories.expense || [];
    const inc = categories.income || [];
    [...exp.map(c => ({ ...c, type: "expense" })),
     ...inc.map(c => ({ ...c, type: "income" }))].forEach(c => {
      db.run("INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)",
        [String(c.id || ("cat_" + Date.now().toString(36))), String(c.name || "Other"), c.type, c.icon || "🔘", c.color || null]);
    });
    await persistDB(); // Now async
  },

  clearAll: async () => {
    if (!db) await DB.init();
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM categories");
    await persistDB(); // Now async
  },

  exportFile: async () => {
    if (!db) await DB.init();
    return db.export();
  },

  importFile: async (data) => {
    if (!db) await DB.init();
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    let newDb;
    try {
      newDb = new SQL.Database(buf);
    } catch (e) {
      throw new Error("Corrupt database file");
    }
    const tables = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('transactions','categories')");
    if (!tables.length || tables[0].values.length < 2) {
      throw new Error("Not a wallet database");
    }
    db = newDb;
    migrateTables();
    await persistDB();
    return true;
  },

  saveSetting: async (key, value) => {
    if (!db) await DB.init();
    db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    stmt.run([key, String(value)]);
    stmt.free();
    await persistDB();
  },

  getSetting: async (key) => {
    if (!db) await DB.init();
    db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    const res = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
    if (!res.length || !res[0].values.length) return null;
    return res[0].values[0][0];
  },

};

