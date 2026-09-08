/* =========================================================
   CryptoVault — encrypts the Gemini API key at rest.
   Uses Web Crypto: PBKDF2 (derive key from passphrase) +
   AES-GCM (encrypt/decrypt). Only salt + iv + ciphertext are
   ever persisted; the passphrase and derived key live only
   in memory for the current session.
   ========================================================= */

const CryptoVault = (() => {
  const PBKDF2_ITERATIONS = 150000;
  let sessionKey = null; // CryptoKey, memory-only, cleared on reload

  function bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  }

  async function deriveKey(passphrase, saltBuf) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function hasSessionKey() {
    return sessionKey !== null;
  }

  function clearSession() {
    sessionKey = null;
  }

  // Sets up a brand-new vault: generates a fresh salt, derives the key,
  // caches it in memory, and returns { saltB64 } to store alongside the ciphertext.
  async function initVault(passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    sessionKey = await deriveKey(passphrase, salt);
    return { saltB64: bufToB64(salt) };
  }

  // Unlocks an existing vault given the stored salt; caches derived key in memory.
  async function unlock(passphrase, saltB64) {
    const salt = b64ToBuf(saltB64);
    sessionKey = await deriveKey(passphrase, salt);
  }

  async function encrypt(plaintext) {
    if (!sessionKey) throw new Error("Vault is locked");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, sessionKey, enc.encode(plaintext)
    );
    return { ivB64: bufToB64(iv), cipherB64: bufToB64(cipherBuf) };
  }

  // Returns null (not throws) if decryption fails, e.g. wrong passphrase —
  // AES-GCM's auth tag makes this a reliable "wrong key" signal.
  async function decrypt(ivB64, cipherB64) {
    if (!sessionKey) throw new Error("Vault is locked");
    try {
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBuf(ivB64) }, sessionKey, b64ToBuf(cipherB64)
      );
      return new TextDecoder().decode(plainBuf);
    } catch (e) {
      return null; // wrong passphrase or corrupted data
    }
  }

  return { initVault, unlock, encrypt, decrypt, hasSessionKey, clearSession };
})();

window.CryptoVault = CryptoVault;
