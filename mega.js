const mega = require("megajs");
const stream = require("stream");

// 🔐 Autoryzacja do konta Mega
const getMegaStorage = async () => {
  return await mega.Storage.fromCredentials(
    process.env.MEGA_EMAIL,
    process.env.MEGA_PASSWORD
  );
};

// 📁 Pobierz lub utwórz folder użytkownika
const getUserFolder = async (username) => {
  const storage = await getMegaStorage();
  let folder = storage.files[username];

  if (!folder) {
    console.log("📁 Tworzę nowy folder dla:", username);
    folder = storage.createFolder(username);
    await new Promise((resolve, reject) => {
      folder.on("complete", resolve);
      folder.on("error", reject);
    });
  } else {
    console.log("📁 Folder już istnieje dla:", username);
  }

  return folder;
};

// 🔼 Upload bufora do folderu użytkownika
const uploadBufferToMega = async (buffer, filename, username) => {
  console.log("🔼 Start upload:", filename, "dla użytkownika:", username);

  const folder = await getUserFolder(username);
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const file = folder.upload(filename, bufferStream);

  await new Promise((resolve, reject) => {
    file.on("complete", () => {
      console.log("✅ Upload zakończony:", filename);
      console.log("🔗 Link do pliku:", file.link);
      resolve();
    });
    file.on("error", (err) => {
      console.error("❌ Błąd uploadu:", err);
      reject(err);
    });
  });

  return file.link;
};

// 🔽 Streamowanie pliku z Mega (do pobrania)
const streamFromMega = async (fileUrl) => {
  const file = mega.File.fromURL(fileUrl);
  return file.download();
};

// 📂 Listowanie plików użytkownika
const listUserFiles = async (username) => {
  const folder = await getUserFolder(username);
  return Object.entries(folder.children).map(([name, file]) => ({
    name,
    size: file.size,
    created: file.timestamp,
    link: file.link,
  }));
};

// 🗑️ Usuwanie pliku użytkownika po nazwie
const deleteUserFile = async (username, filename) => {
  const folder = await getUserFolder(username);
  const file = folder.children[filename];
  if (!file) throw new Error("Plik nie istnieje");

  await new Promise((resolve, reject) => {
    file.delete((err) => (err ? reject(err) : resolve()));
  });

  console.log("🗑️ Usunięto plik:", filename, "dla użytkownika:", username);
};

module.exports = {
  uploadBufferToMega,
  streamFromMega,
  listUserFiles,
  deleteUserFile,
};
