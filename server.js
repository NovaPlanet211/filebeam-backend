const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: 'https://novaplanet211.github.io',
  credentials: true
}));
app.use(express.json());

const ADMIN_PASSWORD = "BadMojo2008";

// 🔐 Middleware do autoryzacji admina
app.use("/admin", (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send("Brak dostępu");
  }
  next();
});

// 📁 Konfiguracja multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(__dirname, "uploads", req.params.userId);
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// 📤 Upload pliku
app.post("/upload/:userId", upload.single("file"), (req, res) => {
  res.send("Plik zapisany!");
});

// 📥 Pobieranie pliku
app.get("/download/:userId/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.userId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("Plik nie istnieje");
  res.download(filePath);
});

// 📄 Lista plików użytkownika
app.get("/files/:userId", (req, res) => {
  const dirPath = path.join(__dirname, "uploads", req.params.userId);
  if (!fs.existsSync(dirPath)) return res.status(404).send("Użytkownik nie istnieje");

  fs.readdir(dirPath, (err, files) => {
    if (err) return res.status(500).send("Błąd");
    // filtrujemy plik user.json jeśli istnieje
    const visibleFiles = files.filter(f => f !== "user.json");
    res.json(visibleFiles);
  });
});

// 👥 Lista użytkowników (folderów)
app.get("/admin/users", (req, res) => {
  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) return res.json([]);

  const users = fs.readdirSync(uploadsPath).filter((name) => {
    const fullPath = path.join(uploadsPath, name);
    return fs.statSync(fullPath).isDirectory();
  });

  res.json(users);
});

// 🗑️ Usuwanie pliku
app.delete("/files/:userId/:fileName", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.userId, req.params.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send("Plik nie istnieje");
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Błąd przy usuwaniu:", err);
      return res.status(500).send("Nie udało się usunąć");
    }
    res.send("Plik usunięty");
  });
});

app.delete("/admin/users/:userId", (req, res) => {
  const userDir = path.join(__dirname, "uploads", req.params.userId);
  if (!fs.existsSync(userDir)) return res.status(404).send("Użytkownik nie istnieje");

  fs.rm(userDir, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error("Błąd przy usuwaniu użytkownika:", err);
      return res.status(500).send("Nie udało się usunąć użytkownika");
    }
    res.send("Użytkownik usunięty");
  });
});

// 🌐 Serwowanie plików statycznie
app.use("/files", express.static(path.join(__dirname, "uploads")));

// 🆕 Rejestracja użytkownika (z zapisem user.json)
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Brak nazwy użytkownika lub hasła");

  const userPath = path.join(__dirname, "uploads", username);
  if (fs.existsSync(userPath)) {
    return res.status(409).send("Użytkownik już istnieje");
  }

  try {
    fs.mkdirSync(userPath, { recursive: true });
    // zapisujemy dane użytkownika do pliku user.json (prosty, bez hashowania)
    const userData = { username, password };
    fs.writeFileSync(path.join(userPath, "user.json"), JSON.stringify(userData));
    res.status(201).send("Użytkownik utworzony");
  } catch (e) {
    console.error("Błąd przy tworzeniu użytkownika:", e);
    res.status(500).send("Błąd serwera");
  }
});

// logowanie (odczyt z user.json)
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Brak danych" });

  const userPath = path.join(__dirname, "uploads", username, "user.json");
  if (!fs.existsSync(userPath)) {
    return res.status(404).json({ error: "Użytkownik nie istnieje" });
  }

  try {
    const userData = JSON.parse(fs.readFileSync(userPath, "utf-8"));
    if (userData.password !== password) {
      return res.status(401).json({ error: "Nieprawidłowe hasło" });
    }
    return res.status(200).json({ message: "Zalogowano" });
  } catch (e) {
    console.error("Błąd przy logowaniu:", e);
    return res.status(500).json({ error: "Błąd serwera" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serwer działa na porcie ${port}`);
});

