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

const upload = multer({ storage: multer.memoryStorage() });
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";
const REPO_OWNER = process.env.REPO_OWNER || "JuanHawu";
const REPO_NAME = process.env.REPO_NAME || "creativedatafileabse";

if (!GITHUB_TOKEN) {
  console.error("GITHUB_TOKEN not set in environment variables.");
  process.exit(1);
}

function toBase64(buffer) {
  return buffer.toString("base64");
}

async function uploadToGitHub(path, base64Content) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `Upload ${path}`,
    content: base64Content
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "creative-file-uploader"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub upload failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

app.post("/upload-game", upload.fields([{ name: "zip" }, { name: "logo" }]), async (req, res) => {
  try {
    const { name = "game", author = "", description = "" } = req.body;
    if (!req.files || !req.files.zip || !req.files.logo) {
      return res.status(400).json({ success: false, error: "zip and logo required" });
    }

    const zipBuffer = req.files.zip[0].buffer;
    const logoBuffer = req.files.logo[0].buffer;

    // read zip
    const zip = await JSZip.loadAsync(zipBuffer);
    const folderName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

    const fileEntries = Object.keys(zip.files).filter(k => !zip.files[k].dir);

    // upload each file
    for (const filename of fileEntries) {
      const fileData = zip.files[filename];
      // Ensure filename path inside zip remains consistent; remove leading './' if any
      const normalized = filename.replace(/^(\.\/)/, "");
      const contentBuffer = await fileData.async("nodebuffer");
      const base64 = toBase64(contentBuffer);
      // create path: folderName/normalized
      const path = `${folderName}/${normalized}`;
      await uploadToGitHub(path, base64);
    }

    // upload logo as logo.png
    await uploadToGitHub(`${folderName}/logo.png`, toBase64(logoBuffer));

    // Construct URLs served by GitHub Pages
    const indexUrl = `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/${folderName}/index.html`;
    const logoUrl = `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/${folderName}/logo.png`;

    return res.json({
      success: true,
      indexUrl,
      logoUrl,
      folderName,
      uploadedCount: fileEntries.length + 1
    });

  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
