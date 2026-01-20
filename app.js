import express from "express";
import cors from "cors";
import morgan from "morgan";

import apiRoutes from "./backend/src/routes/index.js";
import { notFoundHandler, errorHandler } from "./backend/src/middleware/error.middleware.js";

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
