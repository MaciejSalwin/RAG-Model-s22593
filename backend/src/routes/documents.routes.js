import { Router } from "express";
import { uploadDocs } from "../controllers/documents.controller.js";
import { uploadPdf } from "../middleware/upload.middleware.js";

const router = Router();

router.post("/", uploadPdf.array("files", 10), uploadDocs);

export default router;
