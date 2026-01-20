import multer from "multer";
import path from "node:path";
import fs from "node:fs";

const uploadDir = path.resolve("storage/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

function safeName(filename) {
  return String(filename ?? "file.pdf").replace(/[^\w.\-]+/g, "_");
}

function isPdf(file) {
  const name = String(file?.originalname ?? "").toLowerCase();
  return file?.mimetype === "application/pdf" || name.endsWith(".pdf");
}

const storage = multer.diskStorage({
  destination(request, file, callback) {
    callback(null, uploadDir);
  },
  filename(request, file, callback) {
    callback(null, `${Date.now()}__${safeName(file.originalname)}`);
  },
});

function fileFilter(request, file, callback) {
  if (!isPdf(file)) return callback(new Error("Only PDF"));
  callback(null, true);
}

export const uploadPdf = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});
