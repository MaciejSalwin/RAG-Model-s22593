import multer from "multer";

export function notFoundHandler(request, response) {
  response.status(404).json({ error: "Not found" });
}

function multerStatus(code) {
  if (code === "LIMIT_FILE_SIZE") return 413;
  return 400;
}

export function errorHandler(error, request, response, next) {
  if (error instanceof multer.MulterError) {
    console.log("Upload failed");
    return response.status(multerStatus(error.code)).json({ error: "Upload failed" });
  }

  console.log("Request failed");
  return response.status(500).json({ error: "Server error" });
}
