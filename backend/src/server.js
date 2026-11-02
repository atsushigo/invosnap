import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./db.js"; // 啟動時建表+載入種子資料
import catalogRouter from "./routes/catalog.js";
import receiptsRouter, { UPLOAD_DIR } from "./routes/receipts.js";
import { isVisionConfigured } from "./vision.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 前端 `npm run build` 的產物，正式環境/對外分享時由這支Express一起伺服（不再直接曝露vite dev server），見docs/12
const FRONTEND_DIST = join(__dirname, "..", "..", "frontend", "dist");

const app = express();
// 預設只開放本機前端dev port，想從其他網域直接打API（例如另外架前端）時用這個env var加白名單，
// 避免用cors()預設值（反射允許任意來源），讓任何網頁的JS都能直接呼叫這支API讀寫資料
const allowedOrigins = (process.env.INVOSNAP_CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, vision_configured: isVisionConfigured() }));
app.use("/api/catalog", catalogRouter);
app.use("/api/receipts", receiptsRouter);
// 原始送貨單照片，覆核頁需要跟辨識結果並排比對用（見docs/07模組三的延伸設計）
app.use("/uploads", express.static(UPLOAD_DIR));

// 前端production build：先跑過 `cd frontend && npm run build` 才會有dist/，本機單純開發(分開跑vite dev)時這個資料夾不存在就跳過
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // Vue Router用history模式，非/api、非/uploads的路徑一律回傳index.html讓前端路由接手
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(join(FRONTEND_DIST, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "伺服器錯誤" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`InvoSnap backend listening on http://localhost:${PORT}`));
