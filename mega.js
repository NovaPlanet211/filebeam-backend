const Mega = require("mega");
const stream = require("stream");

// 🔐 Logowanie do Mega
const getMegaSession = () => {
  return Mega({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
  });
};

// 🔼 Upload bufora do Mega
const uploadBufferToMega = async (buffer, filename, username) => {
  const storage = getMegaSession();

  return new Promise((resolve, reject) => {
    storage.once("ready", () => {
      const fileStream = new stream.PassThrough();
      fileStream.end(buffer);

      const file = storage.upload({ name: `${username}/${filename}` }, fileStream);

      file.on("complete", () => {
        console.log("✅ Upload zakończony:", file.name);
        resolve(file.link);
      });

      file.on("error", reject);
    });

    storage.once("error", reject);
  });
};

// 📂 Listowanie plików użytkownika
const listUserFiles = async (username) => {
  const storage = getMegaSession();

  return new Promise((resolve, reject) => {
    storage.once("ready", () => {
      const files = Object.values(storage.files)
        .filter(f => f.name.startsWith(`${username}/`))
        .map(f => ({
          name: f.name.replace(`${username}/`, ""),
          size: f.size,
          created: f.timestamp,
          link: f.link,
        }));
      resolve(files);
    });

    storage.once("error", reject);
  });
};

// 🔽 Streamowanie pliku z Mega
const streamFromMega = async (fileUrl) => {
  const file = Mega.File.fromURL(fileUrl);
  return file.download();
};

// 🗑️ Usuwanie pliku użytkownika po nazwie
const deleteUserFile = async (username, filename) => {
  const storage = getMegaSession();

  return new Promise((resolve, reject) => {
    storage.once("ready", () => {
      const fullName = `${username}/${filename}`;
      const file = Object.values(storage.files).find(f => f.name === fullName);
      if (!file) return reject(new Error("Plik nie istnieje"));

      file.delete((err) => {
        if (err) return reject(err);
        console.log("🗑️ Usunięto plik:", fullName);
        resolve();
      });
    });

    storage.once("error", reject);
  });
};

module.exports = {
  uploadBufferToMega,
  listUserFiles,
  streamFromMega,
  deleteUserFile,
};
