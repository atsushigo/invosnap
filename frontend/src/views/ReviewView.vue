<template>
  <div v-if="loading" class="card">載入中…</div>
  <div v-else-if="!receipt" class="card">找不到這筆單據。</div>
  <div v-else class="split">
    <!-- 左：原始照片，供對照核實 -->
    <div class="photo-pane card">
      <ImageZoomViewer v-if="receipt.photo_url" :src="receipt.photo_url" />
      <p v-else style="color: var(--text-dim); text-align: center; padding: 40px 0">
        這筆單據沒有留存原始照片（測試資料）
      </p>
    </div>

    <!-- 右：辨識結果與覆核操作 -->
    <div class="review-pane">
      <div class="card">
        <h2>覆核單據 #{{ receipt.id }}</h2>
        <p style="color: var(--text-dim); font-size: 0.9rem">
          供應商：{{ receipt.vendor_name_guess || "未知" }} ｜ 日期：{{ receipt.date_guess || "—" }} ｜
          狀態：<span :class="['badge', receipt.status === 'confirmed' ? 'high' : 'medium']">
            {{ receipt.status === "confirmed" ? "已確認" : "待覆核" }}
          </span>
        </p>

        <p v-if="amountMismatch" class="error-box">
          明細加總 {{ lineSum }}，跟單據上寫的總額 {{ receipt.total_amount_on_receipt }} 對不上，請對照左側照片特別注意。
        </p>
        <p v-if="receipt.notes" style="font-size: 0.85rem; color: var(--text-dim)">辨識備註：{{ receipt.notes }}</p>

        <div v-if="receipt.status === 'confirmed'" class="locked-notice">
          這筆單據已經確認入帳，明細鎖定不能直接改。發現有錯的話，先按「重新開放編輯」退回待覆核狀態，
          改完再重新確認一次——這是修正已確認單據的正式流程，不是直接偷改。
          <div style="margin-top: 8px">
            <button class="secondary" :disabled="submitting" @click="reopen">重新開放編輯</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>原始品名</th>
                <th>數量</th>
                <th>單位</th>
                <th>單價</th>
                <th>金額</th>
                <th>信心</th>
                <th>對應店內品項</th>
                <th>已確認</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in receipt.lines" :key="line.id" :class="{ locked: readonly }">
                <td>
                  <input
                    type="text"
                    class="cell-input"
                    :value="line.name_raw"
                    :disabled="readonly"
                    @change="onFieldChange(line, 'name_raw', $event.target.value)"
                  />
                  <span v-if="line.vendor_item_code" style="color: var(--text-dim); font-size: 0.72rem">
                    ({{ line.vendor_item_code }})
                  </span>
                </td>
                <td>
                  <input
                    type="text"
                    class="cell-input qty"
                    :value="line.qty_raw"
                    :disabled="readonly"
                    @change="onFieldChange(line, 'qty_raw', $event.target.value)"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    class="cell-input qty"
                    :value="line.unit_raw"
                    :disabled="readonly"
                    @change="onFieldChange(line, 'unit_raw', $event.target.value)"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    class="cell-input qty"
                    :value="line.unit_price_raw"
                    :disabled="readonly"
                    @change="onFieldChange(line, 'unit_price_raw', $event.target.value)"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    class="cell-input qty"
                    :value="line.amount_raw"
                    :disabled="readonly"
                    @change="onFieldChange(line, 'amount_raw', $event.target.value)"
                  />
                </td>
                <td><span :class="['badge', line.confidence]">{{ confidenceLabel(line.confidence) }}</span></td>
                <td>
                  <select :value="line.store_item_code || ''" :disabled="readonly" @change="onStoreItemChange(line, $event.target.value)">
                    <option value="">（未對應，需新增品項）</option>
                    <option v-for="item in storeItems" :key="item.code" :value="item.code">
                      {{ item.code }} — {{ item.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    :checked="!!line.confirmed"
                    :disabled="readonly"
                    @change="onConfirmChange(line, $event.target.checked)"
                  />
                </td>
                <td>
                  <button v-if="!readonly" class="secondary danger" title="這一列是誤判，刪掉" @click="removeLine(line)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button v-if="!readonly" class="secondary" style="margin-top: 12px" @click="addLine">
          ＋ 手動新增一列（照片被遮擋或漏抓的品項）
        </button>
      </div>

      <div class="card">
        <button class="primary" :disabled="submitting || readonly" @click="confirmReceipt">
          {{ receipt.status === "confirmed" ? "已確認入帳" : submitting ? "處理中…" : "確認入帳" }}
        </button>
        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "../api.js";
import ImageZoomViewer from "../components/ImageZoomViewer.vue";

const props = defineProps({ id: { type: [String, Number], required: true } });

const receipt = ref(null);
const storeItems = ref([]);
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");

const readonly = computed(() => receipt.value?.status === "confirmed");

const lineSum = computed(() => {
  if (!receipt.value) return 0;
  return receipt.value.lines.reduce((sum, l) => sum + (parseFloat(l.amount_raw) || 0), 0);
});
const amountMismatch = computed(() => {
  if (!receipt.value?.total_amount_on_receipt) return false;
  const stated = parseFloat(receipt.value.total_amount_on_receipt);
  return !Number.isNaN(stated) && Math.abs(stated - lineSum.value) > 0.5;
});

function confidenceLabel(c) {
  return { high: "高", medium: "中", low: "低", manual: "手動" }[c] || c;
}

async function load() {
  loading.value = true;
  const [r, items] = await Promise.all([api.getReceipt(props.id), api.getStoreItems()]);
  receipt.value = r;
  storeItems.value = items;
  loading.value = false;
}

async function onStoreItemChange(line, value) {
  receipt.value = await api.updateLine(receipt.value.id, line.id, { store_item_code: value || null });
}

async function onConfirmChange(line, checked) {
  receipt.value = await api.updateLine(receipt.value.id, line.id, { confirmed: checked });
}

async function onFieldChange(line, field, value) {
  receipt.value = await api.updateLine(receipt.value.id, line.id, { [field]: value });
}

async function removeLine(line) {
  if (!window.confirm(`確定要刪掉「${line.name_raw}」這一列嗎？`)) return;
  receipt.value = await api.deleteLine(receipt.value.id, line.id);
}

async function addLine() {
  receipt.value = await api.addLine(receipt.value.id, { name_raw: "（新品項，請填寫）" });
}

async function confirmReceipt() {
  submitting.value = true;
  errorMessage.value = "";
  try {
    receipt.value = await api.confirmReceipt(receipt.value.id);
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    submitting.value = false;
  }
}

async function reopen() {
  submitting.value = true;
  errorMessage.value = "";
  try {
    receipt.value = await api.reopenReceipt(receipt.value.id);
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.split {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.photo-pane {
  position: sticky;
  top: 16px;
  width: 42%;
  flex-shrink: 0;
  height: calc(100vh - 32px);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.review-pane {
  flex: 1;
  min-width: 0;
}
.table-scroll {
  overflow-x: auto;
}
.cell-input {
  width: 100%;
  min-width: 70px;
  border: 1px solid transparent;
  background: transparent;
  padding: 3px 4px;
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}
.cell-input.qty {
  width: 64px;
  min-width: 0;
}
.cell-input:hover,
.cell-input:focus {
  border-color: var(--border);
  background: var(--bg);
}
.cell-input:disabled {
  color: var(--text-dim);
}
tr.locked td {
  opacity: 0.75;
}
button.secondary.danger {
  color: var(--low);
  border-color: var(--low-bg);
}
.locked-notice {
  background: var(--mid-bg);
  color: var(--mid);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 10px;
  font-size: 0.85rem;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .split {
    flex-direction: column;
  }
  .photo-pane {
    position: relative;
    top: 0;
    width: 100%;
    height: 60vh;
  }
}
</style>
