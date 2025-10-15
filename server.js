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
  res.download(filePath);
});

// 📄 Lista plików użytkownika
app.get("/files/:userId", (req, res) => {
  const dirPath = path.join(__dirname, "uploads", req.params.userId);
  if (!fs.existsSync(dirPath)) return res.status(404).send("Użytkownik nie istnieje");

  fs.readdir(dirPath, (err, files) => {
    if (err) return res.status(500).send("Błąd");
    res.json(files);
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

// 🆕 Rejestracja użytkownika
app.post("/register", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).send("Brak nazwy użytkownika");

  const userPath = path.join(__dirname, "uploads", username);
  if (fs.existsSync(userPath)) {
    return res.status(409).send("Użytkownik już istnieje");
  }

  fs.mkdirSync(userPath, { recursive: true });
  res.send("Użytkownik utworzony");
});
//logowanie
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // znajdź użytkownika w bazie
  const user = users.find(u => u.username === username);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
  }

  return res.status(200).json({ message: "Zalogowano" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serwer działa na porcie ${port}`);
});
