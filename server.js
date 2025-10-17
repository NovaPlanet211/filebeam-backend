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


app.use("/admin", (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send("Brak dostępu");
  }
  next();
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(__dirname, "uploads", req.params.userId);
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });


app.post("/upload/:userId", upload.single("file"), (req, res) => {
  res.send("Plik zapisany!");
});


app.get("/download/:userId/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.userId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("Plik nie istnieje");
  res.download(filePath);
});


app.get("/files/:userId", (req, res) => {
  const { viewer } = req.query; // np. ?viewer=NovaUser
  const targetUser = req.params.userId;

  const targetDir = path.join(__dirname, "uploads", targetUser);
  const viewerFile = viewer ? path.join(__dirname, "uploads", viewer, "user.json") : null;

  if (!fs.existsSync(targetDir)) return res.status(404).send("Użytkownik nie istnieje");

  // Jeśli użytkownik przegląda swoje pliki — zawsze OK
  if (viewer === targetUser) {
    const files = fs.readdirSync(targetDir).filter(f => f !== "user.json");
    return res.json(files);
  }

  // Jeśli przegląda cudze pliki — sprawdź jego typ konta
  if (!viewerFile || !fs.existsSync(viewerFile)) {
    return res.status(403).send("Brak dostępu");
  }

  try {
    const viewerData = JSON.parse(fs.readFileSync(viewerFile, "utf-8"));
    if (viewerData.accountType === "anonimowe") {
      return res.status(403).send("Konto anonimowe nie może przeglądać cudzych plików");
    }

    const files = fs.readdirSync(targetDir).filter(f => f !== "user.json");
    return res.json(files);
  } catch (e) {
    console.error("Błąd przy sprawdzaniu konta:", e);
    return res.status(500).send("Błąd serwera");
  }
});



app.get("/admin/users", (req, res) => {
  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) return res.json([]);

  const users = fs.readdirSync(uploadsPath).filter((name) => {
    const fullPath = path.join(uploadsPath, name);
    return fs.statSync(fullPath).isDirectory();
  });

  res.json(users);
});

app.get("/admin/pending-users", (req, res) => {
  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) return res.json([]);

  const pendingUsers = fs.readdirSync(uploadsPath).filter((name) => {
    const userFile = path.join(uploadsPath, name, "user.json");
    if (!fs.existsSync(userFile)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(userFile, "utf-8"));
      return data.accountType === "zatwierdzane" && data.status === "pending";
    } catch {
      return false;
    }
  });

  res.json(pendingUsers);
});


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

app.post("/admin/approve/:username", (req, res) => {
  const userFile = path.join(__dirname, "uploads", req.params.username, "user.json");
  if (!fs.existsSync(userFile)) return res.status(404).send("Użytkownik nie istnieje");

  try {
    const userData = JSON.parse(fs.readFileSync(userFile, "utf-8"));
    if (userData.accountType !== "zatwierdzane") {
      return res.status(400).send("To konto nie wymaga zatwierdzenia");
    }

    userData.status = "active";
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
    res.send("Konto zatwierdzone");
  } catch (e) {
    console.error("Błąd przy zatwierdzaniu:", e);
    res.status(500).send("Błąd serwera");
  }
});


app.use("/files", express.static(path.join(__dirname, "uploads")));


app.post("/register", (req, res) => {
  const { username, password, accountType, verificationCode } = req.body;

  if (!username) return res.status(400).send("Brak loginu");

  const userPath = path.join(__dirname, "uploads", username);
  if (fs.existsSync(userPath)) {
    return res.status(409).send("Użytkownik już istnieje");
  }

  try {
    fs.mkdirSync(userPath, { recursive: true });

    const userData = {
      username,
      accountType: accountType || "standardowe",
      status: "active"
    };

    if (accountType !== "anonimowe") {
      if (!password) return res.status(400).send("Brak hasła");
      userData.password = password;
    }

    if (accountType === "zatwierdzane") {
      if (!verificationCode || verificationCode.length !== 4) {
        return res.status(400).send("Nieprawidłowy kod weryfikacyjny");
      }
      userData.verificationCode = verificationCode;
      userData.status = "pending";
    }

    fs.writeFileSync(path.join(userPath, "user.json"), JSON.stringify(userData, null, 2));
    res.status(201).send("Użytkownik utworzony");
  } catch (e) {
    console.error("Błąd przy tworzeniu użytkownika:", e);
    res.status(500).send("Błąd serwera");
  }
});


app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: "Brak loginu" });

  const userPath = path.join(__dirname, "uploads", username, "user.json");
  if (!fs.existsSync(userPath)) {
    return res.status(404).json({ error: "Użytkownik nie istnieje" });
  }

  try {
    const userData = JSON.parse(fs.readFileSync(userPath, "utf-8"));

    if (userData.accountType !== "anonimowe") {
      if (!password || userData.password !== password) {
        return res.status(401).json({ error: "Nieprawidłowe hasło" });
      }
    }

    if (userData.accountType === "zatwierdzane" && userData.status !== "active") {
      return res.status(403).json({ error: "Konto niezatwierdzone" });
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

