// server.js (Backend for Creative File Database)
// Node.js 18+ (ESM)
import express from "express";
import cors from "cors";
import multer from "multer";
import JSZip from "jszip";
import fetch from "node-fetch";
import dotenv from "dotenv";

// 🔧 Load environment variables (.env or Railway config)
dotenv.config();

// 🔹 Express setup
const app = express();
app.use(cors());
app.use(express.json());

// 🔹 File upload config (store in memory)
const upload = multer({ storage: multer.memoryStorage() });

// 🔹 GitHub repo config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER || "JuanHawu";
const REPO_NAME = process.env.REPO_NAME || "creativedatafileabase";

if (!GITHUB_TOKEN) {
  console.error("ERROR: Missing GITHUB_TOKEN in environment variables.");
  process.exit(1);
}

// 🔹 Utility to convert buffer to Base64
function toBase64(buffer) {
  return buffer.toString("base64");
}

// 🔹 Upload single file to GitHub via API
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
      "User-Agent": "creative-uploader"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub upload failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

// Root route (cek koneksi)
app.get("/", (req, res) => {
  res.json({ message: "Creative Back Database is running successfully!" });
});

// Upload game ZIP + logo → upload ke GitHub
app.post("/file", upload.fields([{ name: "zip" }, { name: "logo" }]), async (req, res) => {
  try {
    const { name = "game", author = "Unknown", description = "" } = req.body;
    if (!req.files || !req.files.zip || !req.files.logo) {
      return res.status(400).json({ success: false, error: "ZIP and logo are required." });
    }

    const zipBuffer = req.files.zip[0].buffer;
    const logoBuffer = req.files.logo[0].buffer;

    // Extract ZIP
    const zip = await JSZip.loadAsync(zipBuffer);
    const folderName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
    const fileEntries = Object.keys(zip.files).filter(k => !zip.files[k].dir);

    console.log(`Unggah ${fileEntries.length} files to GitHub...`);

    // Upload all extracted files
    for (const filename of fileEntries) {
      const fileData = zip.files[filename];
      const normalized = filename.replace(/^(\.\/)/, ""); // clean path
      const contentBuffer = await fileData.async("nodebuffer");
      await uploadToGitHub(`${folderName}/${normalized}`, toBase64(contentBuffer));
    }

    // Upload logo.png
    await uploadToGitHub(`${folderName}/logo.png`, toBase64(logoBuffer));

    // Generate URLs
    const baseUrl = `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/${folderName}`;
    const indexUrl = `${baseUrl}/index.html`;
    const logoUrl = `${baseUrl}/logo.png`;

    console.log(` Upload done: ${indexUrl}`);

    return res.json({
      success: true,
      indexUrl,
      logoUrl,
      folderName,
      uploadedCount: fileEntries.length + 1
    });
  } catch (err) {
    console.error(" Upload error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔹 Run server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
