<template>
  <div class="card">
    <div class="header-row">
      <h2>單據列表</h2>
      <a :href="exportUrl" class="secondary export-link">匯出已確認單據CSV</a>
    </div>

    <p v-if="loading" style="color: var(--text-dim)">載入中…</p>
    <p v-else-if="receipts.length === 0" style="color: var(--text-dim)">還沒有任何單據，先去「拍照上傳」試試。</p>
    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

    <table v-else class="receipt-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>供應商</th>
          <th>品項數</th>
          <th>總額</th>
          <th>狀態</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in receipts" :key="r.id">
          <td data-label="日期">{{ r.date_guess || "—" }}</td>
          <td data-label="供應商">{{ r.vendor_name_guess || "未知供應商" }}</td>
          <td data-label="品項數">{{ r.line_count }}</td>
          <td data-label="總額">{{ r.total_amount_on_receipt || "—" }}</td>
          <td data-label="狀態"><span :class="['badge', statusBadge(r.status)]">{{ statusLabel(r.status) }}</span></td>
          <td data-label=""><router-link :to="{ name: 'review', params: { id: r.id } }">查看/覆核</router-link></td>
          <td data-label="">
            <button
              v-if="r.status !== 'confirmed'"
              class="secondary danger small"
              title="整筆刪除這張單據（含照片），已確認的單據要先在覆核頁重新開放編輯才能刪"
              @click="remove(r)"
            >
              刪除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { api } from "../api.js";

const receipts = ref([]);
const loading = ref(true);
const errorMessage = ref("");
const exportUrl = api.exportCsvUrl();

function statusLabel(status) {
  return { pending_review: "待覆核", confirmed: "已確認", exported: "已匯出" }[status] || status;
}
function statusBadge(status) {
  return { pending_review: "medium", confirmed: "high", exported: "high" }[status] || "low";
}

async function load() {
  receipts.value = await api.getReceipts();
  loading.value = false;
}

async function remove(receipt) {
  const label = `${receipt.vendor_name_guess || "未知供應商"}（${receipt.date_guess || "日期不明"}）`;
  if (!window.confirm(`確定要整筆刪除「${label}」這張單據嗎？連同照片一起刪掉，無法復原。`)) return;
  errorMessage.value = "";
  try {
    await api.deleteReceipt(receipt.id);
    receipts.value = receipts.value.filter((r) => r.id !== receipt.id);
  } catch (err) {
    errorMessage.value = err.message;
  }
}

onMounted(load);
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.export-link {
  text-decoration: none;
  padding: 9px 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  white-space: nowrap;
}
button.secondary.danger {
  color: var(--low);
  border-color: var(--low-bg);
}
button.small {
  padding: 5px 10px;
  font-size: 0.82rem;
}

/* 手機版：原本的<table>欄位太窄，中文供應商名稱會被逼得一字一行直排，
   改成「每一列變成一張卡片、每個欄位自己一行、前面用data-label當標籤」的
   常見響應式表格作法，不用另外寫一份手機版模板 */
@media (max-width: 640px) {
  .receipt-table thead { display: none; }
  .receipt-table, .receipt-table tbody, .receipt-table tr, .receipt-table td { display: block; width: 100%; }
  .receipt-table tr {
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 10px 14px;
  }
  .receipt-table td {
    border-bottom: none;
    padding: 7px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .receipt-table td[data-label]:not([data-label=""])::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--text-dim);
    font-size: 0.78rem;
    flex-shrink: 0;
  }
  .receipt-table td:last-child { justify-content: flex-end; }
}
</style>
