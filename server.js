// server.js (Node 18+ / ESM)
import express from "express";
import cors from "cors";
import multer from "multer";
import JSZip from "jszip";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// setup multer (in-memory upload)
const upload = multer({ storage: multer.memoryStorage() });

// === KONFIGURASI GITHUB ===
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";
const REPO_OWNER = process.env.REPO_OWNER || "JuanHawu";
const REPO_NAME = process.env.REPO_NAME || "creativebackdatabase";

// === CEK TOKEN ===
if (!GITHUB_TOKEN || GITHUB_TOKEN.startsWith("ghp_your_")) {
  console.error("GITHUB_TOKEN belum diatur di Railway (Environment Variables).");
  process.exit(1);
}

// === FUNCTION UNTUK ENCODE FILE ===
function toBase64(buffer) {
  return buffer.toString("base64");
}

// === UPLOAD FILE KE GITHUB ===
async function uploadToGitHub(path, base64Content) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `Upload ${path}`,
    content: base64Content,
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "creative-backend-uploader",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  // Validasi: jika bukan JSON, jangan parse → tampilkan pesan jelas
  if (!res.ok) {
    if (text.startsWith("<!DOCTYPE")) {
      throw new Error("GitHub API mengembalikan HTML — pastikan repository PUBLIC dan token valid.");
    }
    throw new Error(`GitHub upload gagal (${res.status}): ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respon GitHub tidak valid JSON: ${text.slice(0, 200)}`);
  }
}

// === ROUTE UTAMA ===
app.get("/", (req, res) => {
  res.json({ message: "Creative Back Database server is running fine!" });
});

// === ROUTE UNTUK UPLOAD ZIP ===
app.post("/file", upload.single("zip"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "ZIP file is required" });
    }

    const { name = "game" } = req.body;
    const zipBuffer = req.file.buffer;

    // Buka isi ZIP
    const zip = await JSZip.loadAsync(zipBuffer);
    const folderName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

    const fileEntries = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

    console.log(`Uploading ${fileEntries.length} files to GitHub...`);

    for (const filename of fileEntries) {
      const fileData = zip.files[filename];
      const normalized = filename.replace(/^(\.\/)/, "");
      const contentBuffer = await fileData.async("nodebuffer");
      const base64 = toBase64(contentBuffer);
      const path = `${folderName}/${normalized}`;
      await uploadToGitHub(path, base64);
    }

    // buat URL hasil upload
    const indexUrl = `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/${folderName}/index.html`;

    return res.json({
      success: true,
      uploadedCount: fileEntries.length,
      folderName,
      indexUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
