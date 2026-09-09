/* =========================================================
   Voice Entry — speak a transaction, Gemini parses it into
   structured fields, auto-creates a category if missing,
   and saves it via the existing DB layer.
   ========================================================= */

const GEMINI_MODEL = "gemini-3.5-flash-lite"; // small/cheap, current-gen model for structured extraction
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

const VoiceEntry = (() => {
  let recognition = null;
  let listening = false;
  let lastParsed = null; // { amount, type, category, note, date }
  let finalTranscript = "";

  function els() {
    return {
      sheet: document.getElementById("voiceSheet"),
      status: document.getElementById("voiceStatus"),
      transcript: document.getElementById("voiceTranscript"),
      preview: document.getElementById("voicePreview"),
      toggleBtn: document.getElementById("btn-voice-toggle"),
      confirmBtn: document.getElementById("btn-voice-confirm"),
      cancelBtn: document.getElementById("btn-voice-cancel"),
      fab: document.getElementById("btn-voice-add"),
      pvType: document.getElementById("pv-type"),
      pvAmount: document.getElementById("pv-amount"),
      pvCategory: document.getElementById("pv-category"),
      pvNote: document.getElementById("pv-note"),
      pvDate: document.getElementById("pv-date"),
    };
  }

  function supportsSpeech() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function resetSheet() {
    const e = els();
    finalTranscript = "";
    lastParsed = null;
    e.transcript.textContent = "—";
    e.preview.classList.remove("show");
    e.confirmBtn.classList.remove("show");
    e.status.textContent = 'Tap the mic and say something like "Spent 250 on groceries" or "Received 5000 salary"';
    e.toggleBtn.textContent = "Start Listening";
    e.toggleBtn.classList.remove("stop");
    e.fab.classList.remove("listening");
  }

  async function getDecryptedKey() {
    const cipher = await DB.getSetting("geminiKeyCipher");
    const salt = await DB.getSetting("geminiKeySalt");
    const iv = await DB.getSetting("geminiKeyIv");
    if (!cipher || !salt || !iv) return null;

    if (!CryptoVault.hasSessionKey()) {
      const passphrase = prompt("Enter your passphrase to unlock the Gemini key:");
      if (!passphrase) return null;
      await CryptoVault.unlock(passphrase, salt);
    }

    const plain = await CryptoVault.decrypt(iv, cipher);
    if (plain === null) {
      CryptoVault.clearSession();
      toast("Wrong passphrase");
      return null;
    }
    return plain;
  }

  async function open() {
    if (!supportsSpeech()) {
      toast("Voice input isn't supported in this browser");
      return;
    }
    const hasKey = !!(await DB.getSetting("geminiKeyCipher"));
    if (!hasKey) {
      toast("Add your Gemini API key in Settings first");
      goTo("settings");
      return;
    }
    resetSheet();
    els().sheet.classList.add("show");
  }

  function close() {
    stopListening();
    els().sheet.classList.remove("show");
  }

  function ensureRecognition() {
    if (recognition) return recognition;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN"; // decent default for INR users; browser will still handle most accents

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += chunk + " ";
        else interim += chunk;
      }
      els().transcript.textContent = (finalTranscript + interim).trim() || "—";
    };

    recognition.onerror = (event) => {
      listening = false;
      updateListeningUI();
      if (event.error === "no-speech") {
        els().status.textContent = "Didn't catch that — tap the mic and try again.";
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        els().status.textContent = "Microphone permission denied.";
      } else {
        els().status.textContent = "Voice input error: " + event.error;
      }
    };

    recognition.onend = () => {
      listening = false;
      updateListeningUI();
      const text = finalTranscript.trim();
      if (text) {
        parseWithGemini(text);
      }
    };

    return recognition;
  }

  function updateListeningUI() {
    const e = els();
    e.fab.classList.toggle("listening", listening);
    e.toggleBtn.textContent = listening ? "Stop Listening" : "Start Listening";
    e.toggleBtn.classList.toggle("stop", listening);
  }

  function startListening() {
    finalTranscript = "";
    lastParsed = null;
    els().preview.classList.remove("show");
    els().confirmBtn.classList.remove("show");
    els().transcript.textContent = "Listening…";
    els().status.textContent = "Listening — speak now.";
    try {
      ensureRecognition().start();
      listening = true;
      updateListeningUI();
    } catch (e) {
      console.error(e);
      toast("Couldn't start microphone");
    }
  }

  function stopListening() {
    if (recognition && listening) {
      try { recognition.stop(); } catch (e) {}
    }
    listening = false;
    updateListeningUI();
  }

  function toggleListening() {
    if (listening) stopListening();
    else startListening();
  }

  /* ---------------- Gemini parsing ---------------- */

  function buildPrompt(text, categories) {
    const catNames = {
      expense: categories.expense.map(c => c.name),
      income: categories.income.map(c => c.name),
    };
    return `You convert a spoken finance note into strict JSON describing one transaction.

Existing expense categories: ${JSON.stringify(catNames.expense)}
Existing income categories: ${JSON.stringify(catNames.income)}

Rules:
- "type" must be exactly "expense" or "income" (debit/spent/paid/bought => expense; credit/received/earned/got paid => income).
- "amount" must be a positive number, no currency symbols.
- "category" should reuse an existing category name from the matching list above if one clearly fits (case-insensitive match is fine). If nothing fits well, invent a short, sensible new category name (Title Case, 1-3 words).
- "note" is a short free-text description (what it was for), can be empty string.
- "date" is "today" unless the speaker mentions a relative or explicit date, in which case output it as YYYY-MM-DD. If unsure, use "today".
- Respond with ONLY raw JSON, no markdown fences, no explanation. Shape:
{"amount": number, "type": "expense"|"income", "category": string, "note": string, "date": "today"|"YYYY-MM-DD"}

Spoken text: "${text}"`;
  }

  async function parseWithGemini(text) {
    const e = els();
    e.status.textContent = "Thinking…";
    try {
      const key = await getDecryptedKey();
      if (!key) {
        e.status.textContent = "Voice add needs the Gemini key unlocked. Tap the mic again.";
        return;
      }
      const prompt = buildPrompt(text, state.categories);

      const res = await fetch(GEMINI_URL(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("Gemini error", res.status, errBody);
        const hint = res.status === 404
          ? "Model unavailable — it may have been retired. Update GEMINI_MODEL in voice.js."
          : res.status === 401 || res.status === 403
          ? "Check that your API key is valid."
          : "Please try again.";
        e.status.textContent = `Gemini request failed (${res.status}). ${hint}`;
        return;
      }

      const data = await res.json();
      const raw = (data.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || "")
        .join("")
        .trim();

      const clean = raw.replace(/^```json\s*|```$/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (err) {
        console.error("Failed to parse Gemini JSON:", raw);
        e.status.textContent = "Couldn't understand that — try rephrasing.";
        return;
      }

      const amount = Number(parsed.amount);
      const type = parsed.type === "income" ? "income" : "expense";
      if (!amount || isNaN(amount) || amount <= 0) {
        e.status.textContent = "Couldn't figure out the amount — try again.";
        return;
      }

      const category = sanitizeText(parsed.category, "Other", 24) || "Other";
      const note = sanitizeText(parsed.note, "", 120);
      const date = normalizeVoiceDate(parsed.date);

      lastParsed = { amount: Number(amount.toFixed(2)), type, category, note, date };
      showPreview(lastParsed);
      e.status.textContent = "Review and confirm below.";
    } catch (err) {
      console.error(err);
      e.status.textContent = "Something went wrong talking to Gemini.";
    }
  }

  function normalizeVoiceDate(d) {
    if (!d || d === "today") return todayISO();
    const norm = normalizeDate(d);
    return norm || todayISO();
  }

  function showPreview(p) {
    const e = els();
    e.pvType.textContent = p.type === "income" ? "Income" : "Expense";
    e.pvType.className = "amt " + p.type;
    e.pvAmount.textContent = fmt(p.amount) ;
    e.pvAmount.className = "amt " + p.type;
    e.pvCategory.textContent = p.category;
    e.pvNote.textContent = p.note || "—";
    e.pvDate.textContent = p.date;
    e.preview.classList.add("show");
    e.confirmBtn.classList.add("show");
  }

  /* ---------------- Save flow ---------------- */

  function findOrWillCreateCategory(name, type) {
    const list = state.categories[type] || [];
    const existing = list.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    return existing || null;
  }

  async function ensureCategory(name, type) {
    const existing = findOrWillCreateCategory(name, type);
    if (existing) return existing.id;

    const palette = ["#7C8CFF", "#FF6B6B", "#33D69F", "#F5C542", "#5CC8FF", "#FF8FD4", "#FFA463", "#4FD1C5"];
    const icon = type === "income" ? "💰" : "🧾";
    const color = palette[Math.floor(Math.random() * palette.length)];
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + "_" + uid().slice(0, 4);
    const newCat = { id, name: name.trim(), icon, color };
    state.categories[type].push(newCat);
    await persistCategories();
    return id;
  }

  async function confirmAndSave() {
    if (!lastParsed) return;
    const e = els();
    e.confirmBtn.disabled = true;
    e.confirmBtn.textContent = "Saving…";
    try {
      const categoryId = await ensureCategory(lastParsed.category, lastParsed.type);
      const newTx = {
        id: uid(),
        amount: lastParsed.amount,
        type: lastParsed.type,
        categoryId,
        note: lastParsed.note,
        date: lastParsed.date,
        createdAt: Date.now(),
      };
      await DB.addTransaction(newTx);
      state.transactions.push(newTx);

      // Refresh any visible screens
      renderHome();
      renderAllTransactions();
      renderCategoryManage();
      renderAddCatGrid();

      toast("Transaction added by voice");
      close();
    } catch (err) {
      console.error(err);
      toast("Failed to save transaction");
    } finally {
      e.confirmBtn.disabled = false;
      e.confirmBtn.textContent = "Add Transaction";
    }
  }

  /* ---------------- Wiring ---------------- */

  function setup() {
    document.getElementById("btn-voice-toggle")?.addEventListener("click", toggleListening);
    document.getElementById("btn-voice-confirm")?.addEventListener("click", confirmAndSave);
    document.getElementById("btn-voice-cancel")?.addEventListener("click", close);
  }

  document.addEventListener("DOMContentLoaded", setup);

  return { open, close };
})();

window.VoiceEntry = VoiceEntry;
