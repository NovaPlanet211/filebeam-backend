// routes/upload.js — Endpoint do generowania signed URL (PUT) dla Cloudflare R2

const express = require("express");
const router = express.Router();
const { getSignedPutUrl } = require("../r2");
const path = require("path");
const fsp = require("fs").promises;

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads");

// Pomocnicze funkcje user.json (lokalne metadane)
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

// GET /upload/signed-url/:userId?filename=...&contentType=...
router.get("/signed-url/:userId", async (req, res) => {
  const { filename, contentType } = req.query;
  const { userId } = req.params;
  if (!filename || !contentType) return res.status(400).send("Brak filename lub contentType");

  const key = `${userId}/${filename}`;
  const url = getSignedPutUrl(key, contentType);

  // Zapisz metadane lokalne (opcjonalne)
  const userData = (await readUserJson(userId)) || { username: userId, accountType: "standardowe", status: "active", files: {} };
  userData.files = userData.files || {};
  userData.files[filename] = { key, lastSignedAt: Date.now() };
  await writeUserJson(userId, userData);

  res.json({ url, key });
});

module.exports = router;

