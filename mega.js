// Uwaga: ten moduł używa megajs z GitHub (HTTPS). Jeśli chcesz inny fork,
// zmień zależność w package.json.
const Mega = require("megajs");
const stream = require("stream");
const { promisify } = require("util");

const loginOptions = {
  email: process.env.MEGA_EMAIL,
  password: process.env.MEGA_PASSWORD,
  keepalive: true,
};

function getStorage() {
  return new Promise((resolve, reject) => {
    const storage = Mega(loginOptions);
    storage.on("ready", () => resolve(storage));
    storage.on("error", (e) => reject(e));
  });
}

async function uploadBufferToMega(buffer, filename, username) {
  const storage = await getStorage();
  // Użyj folderu root lub utwórz per-user folder
  const folderPath = `/${username}`;
  let folder = storage.root.children.find((c) => c.name === username && c.dir);
  if (!folder) {
    folder = storage.root.mkdir(username);
  }

  return new Promise((resolve, reject) => {
    const pass = new stream.PassThrough();
    pass.end(buffer);

    const upload = folder.upload({ name: filename }, pass);

    upload.on("complete", () => {
      // export link
      storage.getFile(upload).link((err, url) => {
        if (err) return reject(err);
        resolve(url);
      });
    });

    upload.on("error", (err) => reject(err));
  });
}

async function listUserFiles(username) {
  const storage = await getStorage();
  const folder = storage.root.children.find((c) => c.name === username && c.dir);
  if (!folder) return [];
  // Mapowanie plików
  return folder.children.filter(c => !c.dir).map(f => ({
    name: f.name,
    size: f.size,
    timestamp: f.timestamp,
    nodeId: f.nodeId || f.handle
  }));
}

async function deleteUserFile(username, filename) {
  const storage = await getStorage();
  const folder = storage.root.children.find((c) => c.name === username && c.dir);
  if (!folder) throw new Error("user folder not found");
  const file = folder.children.find(c => !c.dir && c.name === filename);
  if (!file) throw new Error("file not found");
  return new Promise((resolve, reject) => {
    file.delete(error => error ? reject(error) : resolve());
  });
}

async function streamFromMega(fileUrl) {
  // megajs posiada metodę download link-based; najprościej użyć megajs File.fromURL
  const file = Mega.File.fromURL ? Mega.File.fromURL(fileUrl) : null;
  if (!file) throw new Error("streaming not supported by installed megajs");
  return file.download();
}

module.exports = {
  uploadBufferToMega,
  listUserFiles,
  deleteUserFile,
  streamFromMega,
};

