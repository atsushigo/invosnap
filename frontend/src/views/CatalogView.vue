<template>
  <div class="catalog-view">
    <h2>主檔維護</h2>
    <p class="hint">
      這裡整合三份互相關聯的資料：<b>店內主檔</b>（店裡有哪些標準品項）、<b>供應商</b>（廠商基本資料）、
      <b>廠商對照表</b>（各家單據上的品名怎麼對應到店內品項）。新增/修改的內容會立刻影響拍照辨識覆核頁的下拉選單。
    </p>

    <div class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ active: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
        <span v-if="t.count != null" class="tab-count">{{ t.count }}</span>
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <!-- ============ 店內主檔 ============ -->
    <section v-if="tab === 'items'">
      <form class="add-form card" @submit.prevent="submitNewItem">
        <h3>新增店內品項</h3>
        <div class="form-row">
          <label>品項名稱<input v-model="newItem.name" type="text" required placeholder="例如：高麗菜" /></label>
          <label>
            分類
            <select v-model="newItem.category">
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              <option value="__custom__">其他（自訂分類）</option>
            </select>
          </label>
          <input v-if="newItem.category === '__custom__'" v-model="newItem.customCategory" type="text" placeholder="輸入新分類名稱" required />
          <label>
            標準單位
            <select v-model="newItem.standard_unit">
              <option v-for="u in commonUnits" :key="u" :value="u">{{ u }}</option>
              <option value="__custom__">其他（自訂單位）</option>
            </select>
          </label>
          <input v-if="newItem.standard_unit === '__custom__'" v-model="newItem.customUnit" type="text" placeholder="輸入單位" required />
        </div>
        <button class="primary" type="submit">新增品項（代碼自動產生）</button>
      </form>

      <div v-for="group in groupedItems" :key="group.category" class="card group-card">
        <h4>{{ group.category }}　<span class="dim">({{ group.items.length }}項)</span></h4>
        <div class="row-list">
          <div v-for="item in group.items" :key="item.code" class="row-item">
            <template v-if="editingItem === item.code">
              <input v-model="editItemDraft.name" type="text" />
              <select v-model="editItemDraft.category">
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              </select>
              <select v-model="editItemDraft.standard_unit">
                <option v-for="u in commonUnits" :key="u" :value="u">{{ u }}</option>
                <option v-if="!commonUnits.includes(editItemDraft.standard_unit)" :value="editItemDraft.standard_unit">
                  {{ editItemDraft.standard_unit }}
                </option>
              </select>
              <button class="secondary small" @click="saveItem(item.code)">儲存</button>
              <button class="secondary small" @click="editingItem = null">取消</button>
            </template>
            <template v-else>
              <span class="code-tag">{{ item.code }}</span>
              <span class="name">{{ item.name }}</span>
              <span class="dim">{{ item.standard_unit }}</span>
              <button class="secondary small" @click="startEditItem(item)">編輯</button>
              <button class="secondary small danger" @click="removeItem(item)">刪除</button>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 供應商 ============ -->
    <section v-if="tab === 'vendors'">
      <form class="add-form card" @submit.prevent="submitNewVendor">
        <h3>新增供應商</h3>
        <div class="form-row">
          <label>供應商名稱<input v-model="newVendor.name" type="text" required placeholder="例如：阿凱生蔬" /></label>
          <label>類型<input v-model="newVendor.type" type="text" placeholder="例如：生鮮蔬果" /></label>
          <label class="checkbox-label"><input v-model="newVendor.has_vendor_item_code" type="checkbox" /> 單據上有廠商自己的品項編號</label>
        </div>
        <div class="form-row">
          <label class="wide">單位習慣（備註）<input v-model="newVendor.unit_habit" type="text" placeholder="例如：台斤為主，偶爾用包/盒計價" /></label>
        </div>
        <div class="form-row">
          <label class="wide">單據風格（備註）<input v-model="newVendor.document_style" type="text" placeholder="例如：手寫送貨單，品名+數量+單價" /></label>
        </div>
        <button class="primary" type="submit">新增供應商（代碼自動產生）</button>
      </form>

      <div class="card group-card">
        <div class="row-list">
          <div v-for="v in vendors" :key="v.id" class="row-item vendor-row">
            <template v-if="editingVendor === v.id">
              <input v-model="editVendorDraft.name" type="text" />
              <input v-model="editVendorDraft.type" type="text" placeholder="類型" />
              <input v-model="editVendorDraft.unit_habit" type="text" placeholder="單位習慣" class="wide-input" />
              <input v-model="editVendorDraft.document_style" type="text" placeholder="單據風格" class="wide-input" />
              <label class="checkbox-label"><input v-model="editVendorDraft.has_vendor_item_code" type="checkbox" /> 有品項編號</label>
              <button class="secondary small" @click="saveVendor(v.id)">儲存</button>
              <button class="secondary small" @click="editingVendor = null">取消</button>
            </template>
            <template v-else>
              <span class="code-tag">{{ v.id }}</span>
              <span class="name">{{ v.name }}</span>
              <span class="dim">{{ v.type || "—" }}</span>
              <span class="badge" :class="v.has_vendor_item_code ? 'high' : 'medium'">
                {{ v.has_vendor_item_code ? "有品項編號" : "無品項編號" }}
              </span>
              <button class="secondary small" @click="startEditVendor(v)">編輯</button>
              <button class="secondary small danger" @click="removeVendor(v)">刪除</button>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 廠商對照表 ============ -->
    <section v-if="tab === 'mappings'">
      <form class="add-form card" @submit.prevent="submitNewMapping">
        <h3>新增對照</h3>
        <div class="form-row">
          <label>
            供應商
            <select v-model="newMapping.vendor_id" required>
              <option value="" disabled>請選擇</option>
              <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
            </select>
          </label>
          <label>廠商品項編號（選填）<input v-model="newMapping.vendor_item_code" type="text" /></label>
          <label class="wide">廠商單據上的品名<input v-model="newMapping.vendor_item_name_raw" type="text" required /></label>
        </div>
        <div class="form-row">
          <label class="wide">
            對應到店內品項
            <select v-model="newMapping.store_item_code">
              <option value="">— 尚未對照 —</option>
              <optgroup v-for="group in groupedItems" :key="group.category" :label="group.category">
                <option v-for="item in group.items" :key="item.code" :value="item.code">{{ item.name }}（{{ item.standard_unit }}）</option>
              </optgroup>
            </select>
          </label>
          <label>換算率<input v-model="newMapping.conversion_rate" type="text" placeholder="例如 0.6" /></label>
          <label>包裝內容量<input v-model="newMapping.pack_content_qty" type="text" placeholder="例如 2（台斤/包）" /></label>
        </div>
        <div class="form-row">
          <label class="wide">備註<input v-model="newMapping.note" type="text" /></label>
        </div>
        <button class="primary" type="submit">新增對照</button>
      </form>

      <div class="tab-filter">
        <button v-for="f in statusFilters" :key="f.key" :class="{ active: statusFilter === f.key }" @click="statusFilter = f.key">
          {{ f.label }}
        </button>
      </div>

      <div v-for="group in filteredMappingsByVendor" :key="group.vendor_id" class="card group-card">
        <h4>{{ group.vendor_name }}</h4>
        <div class="row-list">
          <div v-for="m in group.mappings" :key="m.id" class="row-item mapping-row">
            <template v-if="editingMapping === m.id">
              <input v-model="editMappingDraft.vendor_item_code" type="text" placeholder="廠商編號" />
              <input v-model="editMappingDraft.vendor_item_name_raw" type="text" placeholder="廠商品名" class="wide-input" />
              <select v-model="editMappingDraft.store_item_code">
                <option value="">— 尚未對照 —</option>
                <optgroup v-for="g in groupedItems" :key="g.category" :label="g.category">
                  <option v-for="item in g.items" :key="item.code" :value="item.code">{{ item.name }}</option>
                </optgroup>
              </select>
              <select v-model="editMappingDraft.status">
                <option value="confirmed">已確認</option>
                <option value="needs_confirmation">待確認</option>
                <option value="new_item">新品項</option>
              </select>
              <input v-model="editMappingDraft.note" type="text" placeholder="備註" class="wide-input" />
              <button class="secondary small" @click="saveMapping(m.id)">儲存</button>
              <button class="secondary small" @click="editingMapping = null">取消</button>
            </template>
            <template v-else>
              <span class="code-tag" v-if="m.vendor_item_code">{{ m.vendor_item_code }}</span>
              <span class="name">{{ m.vendor_item_name_raw }}</span>
              <span class="arrow">→</span>
              <span :class="{ dim: !m.store_item_name }">{{ m.store_item_name || "尚未對照" }}</span>
              <span class="badge" :class="statusBadgeClass(m.status)">{{ statusLabel(m.status) }}</span>
              <span v-if="m.note" class="dim note">「{{ m.note }}」</span>
              <button class="secondary small" @click="startEditMapping(m)">編輯</button>
              <button class="secondary small danger" @click="removeMapping(m)">刪除</button>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { api } from "../api.js";

const tab = ref("items");
const error = ref("");
const statusFilter = ref("all");

const storeItems = ref([]);
const vendors = ref([]);
const mappings = ref([]);

const commonUnits = ["台斤", "公斤", "包", "盒", "箱", "條", "顆", "支", "片"];
const categories = ["葉菜類", "根莖/瓜果類", "菇類", "豆製品", "加工肉品/丸類", "主食/澱粉類", "配料/其他"];
const statusFilters = [
  { key: "all", label: "全部" },
  { key: "needs_confirmation", label: "待確認" },
  { key: "confirmed", label: "已確認" },
  { key: "new_item", label: "新品項" },
];

const tabs = computed(() => [
  { key: "items", label: "店內主檔", count: storeItems.value.length },
  { key: "vendors", label: "供應商", count: vendors.value.length },
  { key: "mappings", label: "廠商對照表", count: mappings.value.length },
]);

async function loadAll() {
  error.value = "";
  try {
    const [items, v, m] = await Promise.all([api.getStoreItems(), api.getVendors(), api.getMappings()]);
    storeItems.value = items;
    vendors.value = v;
    mappings.value = m;
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(loadAll);

async function guard(fn) {
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  }
}

// ---------- 店內主檔 ----------

const groupedItems = computed(() => {
  const map = new Map();
  for (const item of storeItems.value) {
    const key = item.category || "其他";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
});

const newItem = reactive({ name: "", category: categories[0], customCategory: "", standard_unit: commonUnits[0], customUnit: "" });

async function submitNewItem() {
  await guard(async () => {
    const category = newItem.category === "__custom__" ? newItem.customCategory.trim() : newItem.category;
    const standard_unit = newItem.standard_unit === "__custom__" ? newItem.customUnit.trim() : newItem.standard_unit;
    if (!newItem.name.trim() || !standard_unit) return;
    await api.createStoreItem({ name: newItem.name.trim(), category, standard_unit });
    newItem.name = "";
    newItem.customCategory = "";
    newItem.customUnit = "";
    await loadAll();
  });
}

const editingItem = ref(null);
const editItemDraft = reactive({ name: "", category: "", standard_unit: "" });
function startEditItem(item) {
  editingItem.value = item.code;
  Object.assign(editItemDraft, { name: item.name, category: item.category, standard_unit: item.standard_unit });
}
async function saveItem(code) {
  await guard(async () => {
    await api.updateStoreItem(code, { ...editItemDraft });
    editingItem.value = null;
    await loadAll();
  });
}
async function removeItem(item) {
  if (!window.confirm(`確定要刪除「${item.name}」嗎？如果已經有對照或單據明細在用這個品項會被擋下來。`)) return;
  await guard(async () => {
    await api.deleteStoreItem(item.code);
    await loadAll();
  });
}

// ---------- 供應商 ----------

const newVendor = reactive({ name: "", type: "", unit_habit: "", document_style: "", has_vendor_item_code: false });
async function submitNewVendor() {
  await guard(async () => {
    if (!newVendor.name.trim()) return;
    await api.createVendor({ ...newVendor, name: newVendor.name.trim() });
    Object.assign(newVendor, { name: "", type: "", unit_habit: "", document_style: "", has_vendor_item_code: false });
    await loadAll();
  });
}

const editingVendor = ref(null);
const editVendorDraft = reactive({ name: "", type: "", unit_habit: "", document_style: "", has_vendor_item_code: false });
function startEditVendor(v) {
  editingVendor.value = v.id;
  Object.assign(editVendorDraft, {
    name: v.name,
    type: v.type || "",
    unit_habit: v.unit_habit || "",
    document_style: v.document_style || "",
    has_vendor_item_code: !!v.has_vendor_item_code,
  });
}
async function saveVendor(id) {
  await guard(async () => {
    await api.updateVendor(id, { ...editVendorDraft });
    editingVendor.value = null;
    await loadAll();
  });
}
async function removeVendor(v) {
  if (!window.confirm(`確定要刪除供應商「${v.name}」嗎？如果已經有對照或單據在用這家供應商會被擋下來。`)) return;
  await guard(async () => {
    await api.deleteVendor(v.id);
    await loadAll();
  });
}

// ---------- 廠商對照表 ----------

const newMapping = reactive({
  vendor_id: "",
  vendor_item_code: "",
  vendor_item_name_raw: "",
  store_item_code: "",
  conversion_rate: "",
  pack_content_qty: "",
  note: "",
});
async function submitNewMapping() {
  await guard(async () => {
    if (!newMapping.vendor_id || !newMapping.vendor_item_name_raw.trim()) return;
    await api.createMapping({
      vendor_id: newMapping.vendor_id,
      vendor_item_code: newMapping.vendor_item_code || null,
      vendor_item_name_raw: newMapping.vendor_item_name_raw.trim(),
      store_item_code: newMapping.store_item_code || null,
      conversion_rate: newMapping.conversion_rate ? Number(newMapping.conversion_rate) : null,
      pack_content_qty: newMapping.pack_content_qty ? Number(newMapping.pack_content_qty) : null,
      note: newMapping.note || null,
    });
    Object.assign(newMapping, {
      vendor_item_code: "",
      vendor_item_name_raw: "",
      store_item_code: "",
      conversion_rate: "",
      pack_content_qty: "",
      note: "",
    });
    await loadAll();
  });
}

const filteredMappingsByVendor = computed(() => {
  const filtered = mappings.value.filter((m) => statusFilter.value === "all" || m.status === statusFilter.value);
  const map = new Map();
  for (const m of filtered) {
    const key = m.vendor_id || "unknown";
    if (!map.has(key)) map.set(key, { vendor_id: key, vendor_name: m.vendor_name || "（未知供應商）", mappings: [] });
    map.get(key).mappings.push(m);
  }
  return Array.from(map.values());
});

function statusLabel(status) {
  return { confirmed: "已確認", needs_confirmation: "待確認", new_item: "新品項" }[status] || status;
}
function statusBadgeClass(status) {
  return { confirmed: "high", needs_confirmation: "medium", new_item: "low" }[status] || "medium";
}

const editingMapping = ref(null);
const editMappingDraft = reactive({ vendor_item_code: "", vendor_item_name_raw: "", store_item_code: "", status: "", note: "" });
function startEditMapping(m) {
  editingMapping.value = m.id;
  Object.assign(editMappingDraft, {
    vendor_item_code: m.vendor_item_code || "",
    vendor_item_name_raw: m.vendor_item_name_raw,
    store_item_code: m.store_item_code || "",
    status: m.status,
    note: m.note || "",
  });
}
async function saveMapping(id) {
  await guard(async () => {
    await api.updateMapping(id, {
      vendor_item_code: editMappingDraft.vendor_item_code || null,
      vendor_item_name_raw: editMappingDraft.vendor_item_name_raw,
      store_item_code: editMappingDraft.store_item_code || null,
      status: editMappingDraft.status,
      note: editMappingDraft.note || null,
    });
    editingMapping.value = null;
    await loadAll();
  });
}
async function removeMapping(m) {
  if (!window.confirm(`確定要刪除這筆對照「${m.vendor_item_name_raw}」嗎？`)) return;
  await guard(async () => {
    await api.deleteMapping(m.id);
    await loadAll();
  });
}
</script>

<style scoped>
.catalog-view { max-width: 100%; }
.hint { color: var(--text-dim); font-size: 0.88rem; margin-bottom: 16px; }

.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button, .tab-filter button {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-dim);
}
.tabs button.active, .tab-filter button.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; border-color: var(--accent); }
.tab-count { font-size: 0.75rem; opacity: 0.7; margin-left: 4px; }
.tab-filter { display: flex; gap: 6px; margin: 12px 0; }

.add-form h3 { margin-top: 0; }
.form-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.form-row label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-dim); }
.form-row label.wide { flex: 1 1 100%; }
.form-row input[type="text"], .form-row select { min-width: 160px; }
.checkbox-label { flex-direction: row !important; align-items: center; gap: 6px !important; }

.group-card h4 { margin-top: 0; margin-bottom: 10px; }
.row-list { display: flex; flex-direction: column; gap: 8px; }
.row-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.9rem;
}
.row-item .name { font-weight: 600; }
.row-item .dim { color: var(--text-dim); font-size: 0.85rem; }
.row-item .code-tag {
  font-family: monospace;
  background: #efe7dd;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.78rem;
}
.row-item .arrow { color: var(--text-dim); }
.row-item .note { font-style: italic; }
.row-item .wide-input { flex: 1 1 160px; }
button.small { padding: 5px 10px; font-size: 0.8rem; }
button.danger { color: var(--low); border-color: var(--low); }
</style>
