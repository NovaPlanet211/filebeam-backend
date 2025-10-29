// server.js
const { uploadBufferToMega, listUserFiles, deleteUserFile } = require("./mega");
const { streamFromMega } = require("./mega");
const { listMegaFiles, deleteMegaFileByLink } = require("./mega");
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const cors = require("cors");
const compression = require("compression");


const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "BadMojo2008";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://novaplanet211.github.io";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "uploads"); // on Render, set to /data/uploads if persistent disk mounted
const TRASH_DIR = process.env.TRASH_DIR || path.join(__dirname, "trash");       // on Render, set to /data/trash
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || "10000", 10);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());
app.use(compression());

// Simple in-memory cache for file lists
const fileCache = new Map();

// Admin middleware (used on /admin/* and cleanup endpoints)
const adminMiddleware = (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.status(403).send("Brak dostępu");
  next();
};



const storage = multer.memoryStorage();
const upload = multer({ storage });


// Upload endpoint
app.post("/upload/:userId", upload.single("file"), async (req, res) => {
  try {
    const megaLink = await uploadBufferToMega(req.file.buffer, req.file.originalname, req.params.userId);

    const userFile = path.join(UPLOADS_DIR, req.params.userId, "user.json");
    const userData = await readUserJson(req.params.userId) || { files: {} };
    userData.files = userData.files || {};
    userData.files[req.file.originalname] = megaLink;

    await fsp.writeFile(userFile, JSON.stringify(userData, null, 2));
    res.json({ success: true, megaLink });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Błąd uploadu");
  }
});



// Download endpoint (serves file without forcing attachment)
app.get("/download/:userId/:filename", async (req, res) => {
  try {
    const userData = await readUserJson(req.params.userId);
    const megaLink = userData?.files?.[req.params.filename];
    if (!megaLink) return res.status(404).send("Brak linku do pliku");

    const fileStream = await streamFromMega(megaLink);
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
    fileStream.pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Błąd pobierania");
  }
});


app.get("/admin/mega-files", adminMiddleware, async (req, res) => {
  try {
    const files = await listMegaFiles();
    const result = Object.entries(files).map(([name, file]) => ({
      name,
      size: file.size,
      created: file.timestamp,
      link: file.link,
    }));
    res.json(result);
  } catch (err) {
    console.error("Listowanie Mega error:", err);
    res.status(500).send("Błąd listowania");
  }
});

// Static files (allow direct download links)
app.use("/files", express.static(UPLOADS_DIR));

// Helper: read user.json safely
const readUserJson = async (username) => {
  const file = path.join(UPLOADS_DIR, username, "user.json");
  try {
    const txt = await fsp.readFile(file, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

// List files with access rules and caching
app.get("/files/:userId", async (req, res) => {
  const { viewer } = req.query;
  const userId = req.params.userId;
  const userDir = path.join(UPLOADS_DIR, userId);

  try {
    await fsp.access(userDir);
  } catch {
    return res.status(404).send("Użytkownik nie istnieje");
  }

  if (!viewer) return res.status(403).send("Brak dostępu");

  if (viewer !== userId) {
    const viewerData = await readUserJson(viewer);
    if (!viewerData) return res.status(403).send("Brak dostępu");
    if (viewerData.accountType === "anonimowe") return res.status(403).send("Konto anonimowe nie może przeglądać cudzych plików");
  }

  const now = Date.now();
  const cached = fileCache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) return res.json(cached.files);

  try {
    const files = await listUserFiles(userId);
    res.json(files);
    res.json(visible);
  } catch {
    res.status(500).send("Błąd serwera");
  }
});

// Admin routes (protected by adminMiddleware)
app.get("/admin/users", adminMiddleware, async (req, res) => {
  try {
    const entries = await fsp.readdir(UPLOADS_DIR, { withFileTypes: true });
    const users = entries.filter(e => e.isDirectory()).map(e => e.name);
    res.json(users);
  } catch {
    res.json([]);
  }
});

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
app.post("/admin/delete-mega", adminMiddleware, async (req, res) => {
  const { link } = req.body;
  if (!link || !link.startsWith("https://mega.nz/")) {
    return res.status(400).send("Nieprawidłowy link");
  }

  try {
    await deleteMegaFileByLink(link);
    res.send("Plik usunięty z Mega");
  } catch (err) {
    console.error("Usuwanie Mega error:", err);
    res.status(500).send("Błąd usuwania");
  }
});

// Move single file to trash
app.delete("/files/:userId/:fileName", adminMiddleware, async (req, res) => {
  try {
    await deleteUserFile(req.params.userId, req.params.fileName);
    res.send("Plik usunięty z Mega");
  } catch (err) {
    console.error("Usuwanie error:", err);
    res.status(500).send("Błąd usuwania");
  }
});



// Move user to trash
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

// Cleanup trash endpoint (remove entries older than X days)
// Protected by adminMiddleware; call it from Scheduled Job or manually
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
      status: accountType === "zatwierdzane" ? "pending" : "active"
    };
    if (accountType !== "anonimowe") {
      if (!password) return res.status(400).send("Brak hasła");
      userData.password = password;
    }
    if (accountType === "zatwierdzane") {
      if (!verificationCode || verificationCode.length !== 4) return res.status(400).send("Nieprawidłowy kod weryfikacyjny");
      userData.verificationCode = verificationCode;
    }
    await fsp.writeFile(path.join(userPath, "user.json"), JSON.stringify(userData, null, 2));
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

  const userFile = path.join(UPLOADS_DIR, username, "user.json");
  try {
    const txt = await fsp.readFile(userFile, "utf-8");
    const userData = JSON.parse(txt);
    if (userData.accountType !== "anonimowe") {
      if (!password || userData.password !== password) return res.status(401).json({ error: "Nieprawidłowe hasło" });
    }
    if (userData.accountType === "zatwierdzane" && userData.status !== "active") return res.status(403).json({ error: "Konto niezatwierdzone" });
    res.status(200).json({ message: "Zalogowano" });
  } catch {
    return res.status(404).json({ error: "Użytkownik nie istnieje" });
  }
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
