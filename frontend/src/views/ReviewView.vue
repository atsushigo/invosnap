<template>
  <div v-if="loading" class="card">載入中…</div>
  <div v-else-if="!receipt" class="card">找不到這筆單據。</div>
  <div v-else class="split">
    <!-- 左：原始照片，供對照核實。單據不只一頁時上面會有分頁籤可以切換 -->
    <div class="photo-pane card">
      <div v-if="receipt.photos && receipt.photos.length > 1" class="page-tabs">
        <button
          v-for="p in receipt.photos"
          :key="p.page_number"
          :class="['page-tab', { active: activePage === p.page_number }]"
          @click="activePage = p.page_number"
        >
          第{{ p.page_number }}頁
        </button>
      </div>
      <ImageZoomViewer v-if="activePhotoUrl" :key="activePhotoUrl" :src="activePhotoUrl" />
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
        <div v-if="receipt.notes && receipt.notes.length" class="notes-box">
          <div class="notes-title">辨識備註</div>
          <ul>
            <li v-for="(note, i) in receipt.notes" :key="i">{{ note }}</li>
          </ul>
        </div>

        <div v-if="receipt.status === 'confirmed'" class="locked-notice">
          這筆單據已經確認入帳，明細鎖定不能直接改。發現有錯的話，先按「重新開放編輯」退回待覆核狀態，
          改完再重新確認一次——這是修正已確認單據的正式流程，不是直接偷改。
          <div style="margin-top: 8px">
            <button class="secondary" :disabled="submitting" @click="reopen">重新開放編輯</button>
          </div>
        </div>
      </div>

      <!-- 每個品項一張卡，直向排列，不需要左右滑動就能看完整內容 -->
      <div class="line-card" v-for="line in receipt.lines" :key="line.id" :class="{ locked: readonly }">
        <div class="line-card-top">
          <input
            type="text"
            class="cell-input name"
            :value="line.name_raw"
            :title="line.name_raw"
            :disabled="readonly"
            @change="onFieldChange(line, 'name_raw', $event.target.value)"
          />
          <span :class="['badge', line.confidence]">{{ confidenceLabel(line.confidence) }}</span>
          <button
            v-if="receipt.photos && receipt.photos.length > 1 && line.page_number"
            class="page-badge"
            :class="{ active: activePage === line.page_number }"
            title="點一下切換左側照片到這一頁"
            @click="activePage = line.page_number"
          >
            第{{ line.page_number }}頁
          </button>
        </div>
        <div v-if="line.vendor_item_code" class="vendor-code">廠商編號：{{ line.vendor_item_code }}</div>

        <div class="line-card-fields">
          <label class="field">
            <span>數量</span>
            <input
              type="text"
              class="cell-input qty"
              :value="line.qty_raw"
              :disabled="readonly"
              @change="onFieldChange(line, 'qty_raw', $event.target.value)"
            />
          </label>
          <label class="field">
            <span>單位</span>
            <input
              type="text"
              class="cell-input qty"
              :value="line.unit_raw"
              :disabled="readonly"
              @change="onFieldChange(line, 'unit_raw', $event.target.value)"
            />
          </label>
          <label class="field">
            <span>單價</span>
            <input
              type="text"
              class="cell-input qty"
              :value="line.unit_price_raw"
              :disabled="readonly"
              @change="onFieldChange(line, 'unit_price_raw', $event.target.value)"
            />
          </label>
          <label class="field">
            <span>金額</span>
            <input
              type="text"
              class="cell-input qty"
              :value="line.amount_raw"
              :disabled="readonly"
              @change="onFieldChange(line, 'amount_raw', $event.target.value)"
            />
          </label>
        </div>

        <div class="line-card-bottom">
          <select class="match" :value="line.store_item_code || ''" :disabled="readonly" @change="onStoreItemChange(line, $event.target.value)">
            <option value="">（未對應，需新增品項）</option>
            <optgroup v-for="group in groupedStoreItems" :key="group.category" :label="group.category">
              <option v-for="item in group.items" :key="item.code" :value="item.code">
                {{ item.name }}
              </option>
            </optgroup>
          </select>
          <label class="confirm-check">
            <input
              type="checkbox"
              :checked="!!line.confirmed"
              :disabled="readonly"
              @change="onConfirmChange(line, $event.target.checked)"
            />
            已確認
          </label>
          <button v-if="!readonly" class="secondary danger small" title="這一列是誤判，刪掉" @click="removeLine(line)">刪除</button>
        </div>
      </div>

      <div class="card">
        <!-- 手動新增品項：一定要從店內既有品項清單挑選，不開放自由輸入品名，
             避免打錯字或選到店裡根本沒有的東西（見docs/09材料主檔設計） -->
        <div v-if="!readonly" class="add-line-area">
          <button v-if="!showAddForm" class="secondary" @click="showAddForm = true">
            ＋ 手動新增品項（照片被遮擋或漏抓的品項）
          </button>
          <div v-else class="add-line-form">
            <select v-model="newLine.store_item_code" @change="onNewLineItemChange">
              <option value="" disabled>選擇店內品項…</option>
              <optgroup v-for="group in groupedStoreItems" :key="group.category" :label="group.category">
                <option v-for="item in group.items" :key="item.code" :value="item.code">{{ item.name }}</option>
              </optgroup>
            </select>
            <input type="text" class="cell-input qty" placeholder="數量" v-model="newLine.qty_raw" />
            <input type="text" class="cell-input qty" placeholder="單位" v-model="newLine.unit_raw" />
            <input type="text" class="cell-input qty" placeholder="單價" v-model="newLine.unit_price_raw" />
            <button class="primary small" :disabled="!newLine.store_item_code" @click="submitNewLine">新增</button>
            <button class="secondary small" @click="cancelAddLine">取消</button>
          </div>
        </div>
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
import { ref, reactive, computed, onMounted } from "vue";
import { api } from "../api.js";
import ImageZoomViewer from "../components/ImageZoomViewer.vue";

const props = defineProps({ id: { type: [String, Number], required: true } });

const receipt = ref(null);
const storeItems = ref([]);
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");
const showAddForm = ref(false);
const newLine = reactive({ store_item_code: "", qty_raw: "", unit_raw: "", unit_price_raw: "" });
const activePage = ref(1); // 目前左側照片顯示第幾頁，可由頁籤或品項卡片上的頁碼點擊切換

const readonly = computed(() => receipt.value?.status === "confirmed");

const activePhotoUrl = computed(() => {
  const photos = receipt.value?.photos || [];
  return photos.find((p) => p.page_number === activePage.value)?.url ?? photos[0]?.url ?? null;
});

// 依分類分組，讓下拉選單用 <optgroup> 呈現，品項變多時還是好找、方便跟照片核對
const groupedStoreItems = computed(() => {
  const map = new Map();
  for (const item of storeItems.value) {
    const key = item.category || "其他";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
});

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
  activePage.value = 1;
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

// 選了店內品項後，單位自動帶入該品項的標準單位（可再手動調整）
function onNewLineItemChange() {
  const item = storeItems.value.find((i) => i.code === newLine.store_item_code);
  if (item) newLine.unit_raw = item.standard_unit;
}

async function submitNewLine() {
  const item = storeItems.value.find((i) => i.code === newLine.store_item_code);
  if (!item) return;
  receipt.value = await api.addLine(receipt.value.id, {
    name_raw: item.name,
    store_item_code: item.code,
    qty_raw: newLine.qty_raw || null,
    unit_raw: newLine.unit_raw || item.standard_unit,
    unit_price_raw: newLine.unit_price_raw || null,
  });
  cancelAddLine();
}

function cancelAddLine() {
  showAddForm.value = false;
  newLine.store_item_code = "";
  newLine.qty_raw = "";
  newLine.unit_raw = "";
  newLine.unit_price_raw = "";
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
.notes-box {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 10px;
  font-size: 0.85rem;
}
.notes-title {
  font-weight: 600;
  color: var(--text-dim);
  font-size: 0.75rem;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.notes-box ul {
  margin: 0;
  padding-left: 18px;
}
.notes-box li {
  margin: 3px 0;
  color: var(--text);
}
.split {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.photo-pane {
  position: sticky;
  top: 16px;
  width: 38%;
  flex-shrink: 0;
  height: calc(100vh - 32px);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.page-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 8px 0;
  background: var(--panel);
  flex-wrap: wrap;
}
.page-tab {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px 6px 0 0;
  padding: 5px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--text-dim);
}
.page-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
  border-color: var(--accent);
}
.page-badge {
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 2px 8px;
  cursor: pointer;
  font-weight: 600;
}
.page-badge.active {
  border-color: var(--accent);
}
.review-pane {
  flex: 1;
  min-width: 0;
}
.line-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.line-card.locked {
  opacity: 0.7;
}
.line-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cell-input {
  border: 1px solid transparent;
  background: transparent;
  padding: 3px 4px;
  border-radius: 4px;
  font-family: inherit;
  color: inherit;
}
.cell-input.name {
  flex: 1;
  min-width: 0; /* 讓品名優先吃滿整行寬度，字體略縮小一點就能顯示更多字 */
  font-size: 0.86rem;
  font-weight: 600;
}
.cell-input.qty {
  width: 100%;
  font-size: 0.86rem;
}
.cell-input:hover,
.cell-input:focus {
  border-color: var(--border);
  background: var(--bg);
}
.cell-input:disabled {
  color: var(--text-dim);
}
.vendor-code {
  color: var(--text-dim);
  font-size: 0.72rem;
  margin-top: 2px;
}
.line-card-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 8px;
}
.line-card-fields .field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 70px;
  min-width: 70px;
}
.line-card-fields .field span {
  font-size: 0.7rem;
  color: var(--text-dim);
}
.line-card-bottom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.line-card-bottom .match {
  flex: 1 1 200px;
  min-width: 0;
}
.confirm-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
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
.locked-notice {
  background: var(--mid-bg);
  color: var(--mid);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 10px;
  font-size: 0.85rem;
  line-height: 1.6;
}
.add-line-area {
  margin-top: 12px;
}
.add-line-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
}
.add-line-form select {
  flex: 1;
  min-width: 180px;
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
