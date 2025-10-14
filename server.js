const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = `uploads/${req.params.userId}`;
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });


const fs = require("fs");
const path = require("path");

app.post("/upload/:userId", upload.single("file"), (req, res) => {
  const userId = req.params.userId;
  const uploadPath = path.join(__dirname, "uploads", userId);

  // Tworzy folder jeśli nie istnieje
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  // Przenosi plik do folderu użytkownika
  const tempPath = req.file.path;
  const targetPath = path.join(uploadPath, req.file.originalname);

  fs.rename(tempPath, targetPath, (err) => {
    if (err) {
      console.error("Błąd przy zapisie pliku:", err);
      return res.status(500).send("Błąd serwera");
    }
    res.send("Plik zapisany!");
  });
});


app.get("/download/:userId/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.userId, req.params.filename);
  res.download(filePath);
});

app.get("/files/:userId", (req, res) => {
  const dirPath = path.join(__dirname, "uploads", req.params.userId);
  fs.readdir(dirPath, (err, files) => {
    if (err) return res.status(500).send("Błąd");
    res.json(files);
  });
});
app.use("/files", express.static(path.join(__dirname, "uploads")));
app.delete("/files/:userId/:fileName", (req, res) => {
  const { userId, fileName } = req.params;
  const filePath = path.join(__dirname, "uploads", userId, fileName);

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Błąd przy usuwaniu:", err);
      return res.status(500).send("Nie udało się usunąć");
    }
    res.send("Plik usunięty");
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serwer działa port:${port}`);
});


