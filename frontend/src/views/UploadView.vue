<template>
  <div class="card">
    <h2>拍照上傳送貨單</h2>
    <p style="color: var(--text-dim); font-size: 0.9rem">
      選一或多張供應商送貨單照片（同一張單據不只一頁的話，依頁面順序一次全選），
      系統會用Claude Vision辨識成結構化資料，辨識完會帶你到覆核頁確認。
    </p>

    <div v-if="visionConfigured === false" class="setup-notice">
      <strong>還沒設定 API Key，暫時無法辨識。</strong>
      請在 <code>backend/.env</code> 填入 <code>ANTHROPIC_API_KEY</code> 後重新啟動後端（費用試算見文件庫 docs/10）。
      設定好之前你還是可以選圖片預覽，只是按「開始辨識」會失敗。
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      multiple
      @change="onFileChange"
    />

    <div v-if="pages.length" class="page-list">
      <div v-for="(page, i) in pages" :key="page.url" class="page-thumb">
        <span class="page-index">第{{ i + 1 }}頁</span>
        <img :src="page.url" alt="預覽" />
        <p class="page-filename">{{ page.file.name }}</p>
        <div class="page-actions">
          <button class="secondary small" :disabled="i === 0" @click="movePage(i, -1)">←</button>
          <button class="secondary small" :disabled="i === pages.length - 1" @click="movePage(i, 1)">→</button>
          <button class="secondary danger small" @click="removePage(i)">移除</button>
        </div>
      </div>
    </div>

    <div style="margin-top: 16px; display: flex; align-items: center; gap: 12px">
      <button class="primary" :disabled="!pages.length || loading" @click="submit">
        {{ loading ? "辨識中…（可能需要幾秒到十幾秒）" : `開始辨識${pages.length > 1 ? `（共${pages.length}頁）` : ""}` }}
      </button>
      <button v-if="pages.length && !loading" class="secondary" @click="reset">全部重選</button>
    </div>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";

const router = useRouter();
const fileInput = ref(null);
const pages = ref([]); // [{ file, url }]，依頁面順序排列
const loading = ref(false);
const errorMessage = ref("");
const visionConfigured = ref(null); // null=尚未查到，避免畫面一開始就閃一個「未設定」再消失

function onFileChange(event) {
  const files = Array.from(event.target.files || []);
  errorMessage.value = "";
  revokeAllPreviews(); // 重選整批時，先把上一批的預覽網址釋放掉，不留著佔記憶體
  pages.value = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
}

function movePage(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= pages.value.length) return;
  const arr = [...pages.value];
  [arr[index], arr[target]] = [arr[target], arr[index]];
  pages.value = arr;
}

function removePage(index) {
  URL.revokeObjectURL(pages.value[index].url);
  pages.value = pages.value.filter((_, i) => i !== index);
}

function revokeAllPreviews() {
  for (const p of pages.value) URL.revokeObjectURL(p.url);
}

function reset() {
  revokeAllPreviews();
  pages.value = [];
  errorMessage.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

async function submit() {
  if (!pages.value.length) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const receipt = await api.recognizeReceipt(pages.value.map((p) => p.file));
    router.push({ name: "review", params: { id: receipt.id } });
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const health = await api.getHealth();
    visionConfigured.value = health.vision_configured;
  } catch {
    visionConfigured.value = null; // 後端連不上時，不要誤導成「沒設定key」，交給提交時的錯誤訊息說明
  }
});
</script>

<style scoped>
.setup-notice {
  background: var(--accent-soft);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  padding: 10px 14px;
  margin: 12px 0;
  font-size: 0.85rem;
  line-height: 1.6;
}
.setup-notice code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.85em;
}
.page-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}
.page-thumb {
  width: 176px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  text-align: center;
}
.page-thumb img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 6px;
}
.page-index {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 4px;
}
.page-filename {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-actions {
  display: flex;
  gap: 4px;
  justify-content: center;
}
button.small {
  padding: 5px 10px;
  font-size: 0.82rem;
}
button.secondary.danger {
  color: var(--low);
  border-color: var(--low-bg);
}
</style>
