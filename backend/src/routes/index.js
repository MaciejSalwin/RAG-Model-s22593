import { Router } from "express";

import documentsRoutes from "./documents.routes.js";
import questionRoutes from "./question.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/documents", documentsRoutes);
router.use("/question", questionRoutes);
router.use("/health", healthRoutes);

export default router;
