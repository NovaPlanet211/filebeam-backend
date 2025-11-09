require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;

// R2 helpers
const { getSignedPutUrl, getSignedGetUrl, s3 } = require("./r2");

// Konfiguracja
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "BadMojo2008";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://novaplanet211.github.io";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "uploads"); // dla user.json/metadanych
const TRASH_DIR = process.env.TRASH_DIR || path.join(__dirname, "trash");
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || "10000", 10);
const PORT = process.env.PORT || 3000;

// App
const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(compression());

// In-memory cache
const fileCache = new Map();

// Admin middleware
const adminMiddleware = (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.status(403).send("Brak dostępu");
  next();
};

// Helpers: katalogi i user.json
async function ensureDirs() {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(TRASH_DIR, { recursive: true });
}

async function readUserJson(username) {
  const file = path.join(UPLOADS_DIR, username, "user.json");
  try {
    const txt = await fsp.readFile(file, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function writeUserJson(username, data) {
  const userDir = path.join(UPLOADS_DIR, username);
  await fsp.mkdir(userDir, { recursive: true });
  const file = path.join(userDir, "user.json");
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

// R2 ops (list/delete)
async function listR2Objects(prefix) {
  const params = { Bucket: process.env.R2_BUCKET, Prefix: prefix };
  const data = await s3.listObjectsV2(params).promise();
  return (data.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
}

async function deleteR2ObjectByKey(key) {
  await s3.deleteObject({ Bucket: process.env.R2_BUCKET, Key: key }).promise();
}

// -----------------------
// Upload przez signed URL
// -----------------------

app.get("/signed-url/:userId", async (req, res) => {
  const { filename, contentType } = req.query;
  const userId = req.params.userId;
  if (!filename || !contentType) return res.status(400).send("Brak filename lub contentType");

  const key = `${userId}/${filename}`;
  const url = getSignedPutUrl(key, contentType);

  // Zapisz metadane w user.json (bez przenoszenia pliku przez backend)
  const userData = (await readUserJson(userId)) || { username: userId, accountType: "standardowe", status: "active", files: {} };
  userData.files = userData.files || {};
  userData.files[filename] = { key, lastSignedAt: Date.now() };
  await writeUserJson(userId, userData);

  res.json({ url, key });
});

// Pobieranie: zwracamy signed GET (lub redirect)
app.get("/download/:userId/:filename", async (req, res) => {
  try {
    const userData = await readUserJson(req.params.userId);
    const entry = userData?.files?.[req.params.filename];
    if (!entry?.key) return res.status(404).send("Brak wpisu o pliku");

    const signedGet = getSignedGetUrl(entry.key);
    // Możesz użyć redirect:
    // return res.redirect(signedGet);
    res.json({ url: signedGet });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Błąd pobierania");
  }
});

// -----------------------
// Listowanie plików usera
// -----------------------

app.get("/files/:userId", async (req, res) => {
  const { viewer } = req.query;
  const userId = req.params.userId;

  // Musi istnieć user.json
  const userData = await readUserJson(userId);
  if (!userData) return res.status(404).send("Użytkownik nie istnieje");

  if (!viewer) return res.status(403).send("Brak dostępu");

  if (viewer !== userId) {
    const viewerData = await readUserJson(viewer);
    if (!viewerData) return res.status(403).send("Brak dostępu");
    if (viewerData.accountType === "anonimowe")
      return res.status(403).send("Konto anonimowe nie może przeglądać cudzych plików");
  }

  const now = Date.now();
  const cached = fileCache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) return res.json(cached.files);

  try {
    // Listowanie z R2 po prefiksie usera
    const objects = await listR2Objects(`${userId}/`);
    const files = objects.map(o => ({
      filename: o.key.replace(`${userId}/`, ""),
      key: o.key,
      size: o.size,
      lastModified: o.lastModified,
    }));

    fileCache.set(userId, { ts: now, files });
    return res.json(files);
  } catch (err) {
    console.error("List files error:", err);
    return res.status(500).send("Błąd serwera");
  }
});

// -----------------------
// Admin: lista obiektów R2
// -----------------------

app.get("/admin/r2-files", adminMiddleware, async (req, res) => {
  try {
    const data = await listR2Objects("");
    res.json(data);
  } catch (err) {
    console.error("Listowanie R2 error:", err);
    res.status(500).send("Błąd listowania");
  }
});

// Admin: pending users
app.get("/admin/pending-users", adminMiddleware, async (req, res) => {
  try {
    const entries = await fsp.readdir(UPLOADS_DIR, { withFileTypes: true });
    const pending = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const data = await readUserJson(e.name);
      if (data && data.accountType === "zatwierdzane" && data.status === "pending") pending.push(e.name);
    }
    res.json(pending);
  } catch {
    res.json([]);
  }
});

// Admin: approve user
app.post("/admin/approve/:username", adminMiddleware, async (req, res) => {
  const userFile = path.join(UPLOADS_DIR, req.params.username, "user.json");
  try {
    const txt = await fsp.readFile(userFile, "utf-8");
    const data = JSON.parse(txt);
    if (data.accountType !== "zatwierdzane") return res.status(400).send("To konto nie wymaga zatwierdzenia");
    data.status = "active";
    await fsp.writeFile(userFile, JSON.stringify(data, null, 2));
    res.send("Konto zatwierdzone");
  } catch (err) {
    console.error("Błąd przy zatwierdzaniu:", err);
    res.status(500).send("Błąd serwera");
  }
});

// Admin: delete file by key (R2) — zamiana z Mega linków
app.post("/admin/delete-r2", adminMiddleware, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).send("Brak key");
  try {
    await deleteR2ObjectByKey(key);
    res.send("Plik usunięty z R2");
  } catch (err) {
    console.error("Usuwanie R2 error:", err);
    res.status(500).send("Błąd usuwania");
  }
});

// Delete single file (user) — usuń z R2 i z user.json
app.delete("/files/:userId/:fileName", adminMiddleware, async (req, res) => {
  const { userId, fileName } = req.params;
  try {
    const userData = await readUserJson(userId);
    const entry = userData?.files?.[fileName];
    if (!entry?.key) return res.status(404).send("Brak wpisu o pliku");

    await deleteR2ObjectByKey(entry.key);
    delete userData.files[fileName];
    await writeUserJson(userId, userData);
    fileCache.delete(userId);
    res.send("Plik usunięty z R2");
  } catch (err) {
    console.error("Usuwanie error:", err);
    res.status(500).send("Błąd usuwania");
  }
});

// Admin: move user to trash (lokalny katalog)
app.delete("/admin/users/:userId", adminMiddleware, async (req, res) => {
  const userDir = path.join(UPLOADS_DIR, req.params.userId);
  try {
    await fsp.access(userDir);
  } catch {
    return res.status(404).send("Użytkownik nie istnieje");
  }

  try {
    const timestamp = Date.now();
    const dest = path.join(TRASH_DIR, `${req.params.userId}__${timestamp}`);
    await fsp.mkdir(TRASH_DIR, { recursive: true });
    await fsp.rename(userDir, dest);
    fileCache.delete(req.params.userId);
    res.send("Użytkownik przeniesiony do trash");
  } catch (err) {
    console.error("Błąd przy usuwaniu użytkownika:", err);
    res.status(500).send("Nie udało się usunąć użytkownika");
  }
});

// Admin: cleanup trash (starsze niż X dni)
app.post("/admin/cleanup-trash", adminMiddleware, async (req, res) => {
  const days = parseInt(req.query.days || "30", 10);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const entries = await fsp.readdir(TRASH_DIR, { withFileTypes: true });
    let removed = 0;
    for (const e of entries) {
      const p = path.join(TRASH_DIR, e.name);
      const stat = await fsp.stat(p);
      if (stat.mtimeMs < cutoff) {
        await fsp.rm(p, { recursive: true, force: true });
        removed++;
      }
    }
    res.json({ removed });
  } catch (err) {
    console.error("cleanup-trash error", err);
    res.status(500).send("error");
  }
});

// Register
app.post("/register", async (req, res) => {
  const { username, password, accountType, verificationCode } = req.body;
  if (!username) return res.status(400).send("Brak loginu");

  const userPath = path.join(UPLOADS_DIR, username);
  try {
    await fsp.access(userPath);
    return res.status(409).send("Użytkownik już istnieje");
  } catch {}

  try {
    await fsp.mkdir(userPath, { recursive: true });
    const userData = {
      username,
      accountType: accountType || "standardowe",
      status: accountType === "zatwierdzane" ? "pending" : "active",
      files: {},
    };
    if (accountType !== "anonimowe") {
      if (!password) return res.status(400).send("Brak hasła");
      userData.password = password;
    }
    if (accountType === "zatwierdzane") {
      if (!verificationCode || verificationCode.length !== 4) return res.status(400).send("Nieprawidłowy kod weryfikacyjny");
      userData.verificationCode = verificationCode;
    }
    await writeUserJson(username, userData);
    res.status(201).send("Użytkownik utworzony");
  } catch (err) {
    console.error("Błąd przy tworzeniu użytkownika:", err);
    res.status(500).send("Błąd serwera");
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: "Brak loginu" });

  const userData = await readUserJson(username);
  if (!userData) return res.status(404).json({ error: "Użytkownik nie istnieje" });

  if (userData.accountType !== "anonimowe") {
    if (!password || userData.password !== password) return res.status(401).json({ error: "Nieprawidłowe hasło" });
  }
  if (userData.accountType === "zatwierdzane" && userData.status !== "active")
    return res.status(403).json({ error: "Konto niezatwierdzone" });

  res.status(200).json({ message: "Zalogowano" });
});

// Health
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Startup
(async () => {
  try {
    await ensureDirs();
    app.listen(PORT, () => {
      console.log(`Serwer działa na porcie ${PORT}`);
    });
  } catch (e) {
    console.error("Init error", e);
    process.exit(1);
  }
})();
