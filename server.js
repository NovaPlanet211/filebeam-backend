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

app.post("/upload/:userId", upload.single("file"), (req, res) => {
  res.send({ message: "Plik zapisany", filename: req.file.originalname });
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serwer działa port:${port}`);
});


