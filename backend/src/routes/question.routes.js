import { Router } from "express";
import { askQuestion } from "../controllers/question.controller.js";

const router = Router();

router.post("/", askQuestion);

export default router;
