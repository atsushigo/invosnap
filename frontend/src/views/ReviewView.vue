<template>
  <div v-if="loading" class="card">載入中…</div>
  <div v-else-if="!receipt" class="card">找不到這筆單據。</div>
  <div v-else>
    <div class="card">
      <h2>覆核單據 #{{ receipt.id }}</h2>
      <p style="color: var(--text-dim); font-size: 0.9rem">
        供應商：{{ receipt.vendor_name_guess || "未知" }} ｜ 日期：{{ receipt.date_guess || "—" }} ｜
        狀態：<span :class="['badge', receipt.status === 'confirmed' ? 'high' : 'medium']">
          {{ receipt.status === "confirmed" ? "已確認" : "待覆核" }}
        </span>
      </p>

      <p v-if="amountMismatch" class="error-box">
        明細加總 {{ lineSum }}，跟單據上寫的總額 {{ receipt.total_amount_on_receipt }} 對不上，請覆核時特別注意。
      </p>
      <p v-if="receipt.notes" style="font-size: 0.85rem; color: var(--text-dim)">辨識備註：{{ receipt.notes }}</p>
    </div>

    <div class="card">
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
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in receipt.lines" :key="line.id">
            <td>{{ line.name_raw }}<span v-if="line.vendor_item_code" style="color: var(--text-dim); font-size: 0.78rem"> ({{ line.vendor_item_code }})</span></td>
            <td>{{ line.qty_raw }}</td>
            <td>{{ line.unit_raw }}</td>
            <td>{{ line.unit_price_raw ?? "—" }}</td>
            <td>{{ line.amount_raw ?? "—" }}</td>
            <td><span :class="['badge', line.confidence]">{{ confidenceLabel(line.confidence) }}</span></td>
            <td>
              <select :value="line.store_item_code || ''" @change="onStoreItemChange(line, $event.target.value)">
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
                @change="onConfirmChange(line, $event.target.checked)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <button class="primary" :disabled="submitting || receipt.status === 'confirmed'" @click="confirm">
        {{ receipt.status === "confirmed" ? "已確認入帳" : submitting ? "處理中…" : "確認入帳" }}
      </button>
      <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "../api.js";

const props = defineProps({ id: { type: [String, Number], required: true } });

const receipt = ref(null);
const storeItems = ref([]);
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");

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
  return { high: "高", medium: "中", low: "低" }[c] || c;
}

async function load() {
  loading.value = true;
  const [r, items] = await Promise.all([api.getReceipt(props.id), api.getStoreItems()]);
  receipt.value = r;
  storeItems.value = items;
  loading.value = false;
}

async function onStoreItemChange(line, value) {
  const updated = await api.updateLine(receipt.value.id, line.id, { store_item_code: value || null });
  receipt.value = updated;
}

async function onConfirmChange(line, checked) {
  const updated = await api.updateLine(receipt.value.id, line.id, { confirmed: checked });
  receipt.value = updated;
}

async function confirm() {
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

onMounted(load);
</script>
