<template>
  <div class="card">
    <h2>拍照上傳送貨單</h2>
    <p style="color: var(--text-dim); font-size: 0.9rem">
      選一張供應商送貨單照片，系統會用Claude Vision辨識成結構化資料，辨識完會帶你到覆核頁確認。
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
      @change="onFileChange"
    />

    <div v-if="previewUrl" style="margin-top: 12px">
      <img :src="previewUrl" alt="預覽" style="max-width: 260px; border-radius: 8px; border: 1px solid var(--border)" />
      <p style="font-size: 0.82rem; color: var(--text-dim); margin: 6px 0 0">{{ selectedFile.name }}</p>
    </div>

    <div style="margin-top: 16px; display: flex; align-items: center; gap: 12px">
      <button class="primary" :disabled="!selectedFile || loading" @click="submit">
        {{ loading ? "辨識中…（可能需要幾秒到十幾秒）" : "開始辨識" }}
      </button>
      <button v-if="selectedFile && !loading" class="secondary" @click="reset">重選照片</button>
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
const selectedFile = ref(null);
const previewUrl = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const visionConfigured = ref(null); // null=尚未查到，避免畫面一開始就閃一個「未設定」再消失

function onFileChange(event) {
  const file = event.target.files?.[0];
  errorMessage.value = "";
  selectedFile.value = file || null;
  previewUrl.value = file ? URL.createObjectURL(file) : null;
}

function reset() {
  selectedFile.value = null;
  previewUrl.value = null;
  errorMessage.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

async function submit() {
  if (!selectedFile.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const receipt = await api.recognizeReceipt(selectedFile.value);
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
</style>
