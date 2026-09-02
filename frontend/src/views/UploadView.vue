<template>
  <div class="card">
    <h2>拍照上傳送貨單</h2>
    <p style="color: var(--text-dim); font-size: 0.9rem">
      選一張供應商送貨單照片，系統會用Claude Vision辨識成結構化資料，辨識完會帶你到覆核頁確認。
    </p>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      @change="onFileChange"
    />

    <div v-if="previewUrl" style="margin-top: 12px">
      <img :src="previewUrl" alt="預覽" style="max-width: 260px; border-radius: 8px; border: 1px solid var(--border)" />
    </div>

    <div style="margin-top: 16px">
      <button class="primary" :disabled="!selectedFile || loading" @click="submit">
        {{ loading ? "辨識中…" : "開始辨識" }}
      </button>
    </div>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";

const router = useRouter();
const fileInput = ref(null);
const selectedFile = ref(null);
const previewUrl = ref(null);
const loading = ref(false);
const errorMessage = ref("");

function onFileChange(event) {
  const file = event.target.files?.[0];
  errorMessage.value = "";
  selectedFile.value = file || null;
  previewUrl.value = file ? URL.createObjectURL(file) : null;
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
</script>
