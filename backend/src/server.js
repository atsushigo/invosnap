import express from "express";
import cors from "cors";
import "./db.js"; // 啟動時建表+載入種子資料
import catalogRouter from "./routes/catalog.js";
import receiptsRouter, { UPLOAD_DIR } from "./routes/receipts.js";
import { isVisionConfigured } from "./vision.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, vision_configured: isVisionConfigured() }));
app.use("/api/catalog", catalogRouter);
app.use("/api/receipts", receiptsRouter);
// 原始送貨單照片，覆核頁需要跟辨識結果並排比對用（見docs/07模組三的延伸設計）
app.use("/uploads", express.static(UPLOAD_DIR));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "伺服器錯誤" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`InvoSnap backend listening on http://localhost:${PORT}`));
