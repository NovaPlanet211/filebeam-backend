const mega = require("megajs");
const stream = require("stream");

const getMegaStorage = async () => {
  return await mega.Storage.fromCredentials(
    process.env.MEGA_EMAIL,
    process.env.MEGA_PASSWORD
  );
};


const getUserFolder = async (username) => {
  const storage = await getMegaStorage();
  let folder = storage.files[username];
  if (!folder) {
    folder = storage.createFolder(username);
    await new Promise((resolve, reject) => {
      folder.on("complete", resolve);
      folder.on("error", reject);
    });
  }
  return folder;
};


const uploadBufferToMega = async (buffer, filename, username) => {
  const folder = await getUserFolder(username);
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const file = folder.upload(filename, bufferStream);
  await new Promise((resolve, reject) => {
    file.on("complete", resolve);
    file.on("error", reject);
  });

  return file.link;
};

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
};

module.exports = {
  uploadBufferToMega,
  listUserFiles,
  deleteUserFile,
};
