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

// konfigurasi upload in-memory (tidak disimpan di disk)
const upload = multer({ storage: multer.memoryStorage() });

// Ganti ini sesuai repo kamu
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";
const REPO_OWNER = process.env.REPO_OWNER || "JuanHawu";
const REPO_NAME = process.env.REPO_NAME || "creativebackdatabase";

if (!GITHUB_TOKEN) {
  console.error("GITHUB_TOKEN tidak ditemukan di environment variable.");
  process.exit(1);
}

function toBase64(buffer) {
  return buffer.toString("base64");
}

async function uploadToGitHub(path, base64Content) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `Upload ${path}`,
    content: base64Content,
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "creative-uploader",
    },
    body: JSON.stringify(body),
  });

  // Jika responsenya HTML (bukan JSON), tangani agar tidak crash
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from GitHub API: ${text.slice(0, 200)}`);
  }
}

app.get("/", (req, res) => {
  res.json({ message: "Creative Back Database server running successfully!" });
});

// Upload ZIP file
app.post("/file", upload.single("zip"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "ZIP file is required" });
    }

    const { name = "game", author = "", description = "" } = req.body;
    const zipBuffer = req.file.buffer;

    // baca file ZIP
    const zip = await JSZip.loadAsync(zipBuffer);
    const folderName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

    const fileEntries = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

    // upload semua file ke GitHub repo
    for (const filename of fileEntries) {
      const fileData = zip.files[filename];
      const normalized = filename.replace(/^(\.\/)/, "");
      const contentBuffer = await fileData.async("nodebuffer");
      const base64 = toBase64(contentBuffer);
      const path = `${folderName}/${normalized}`;
      await uploadToGitHub(path, base64);
    }

    const indexUrl = `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/${folderName}/index.html`;

    return res.json({
      success: true,
      folderName,
      uploadedCount: fileEntries.length,
      indexUrl,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
