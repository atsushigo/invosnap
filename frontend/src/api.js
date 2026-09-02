const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `請求失敗 (${res.status})`);
  }
  if (res.status === 204) return null; // DELETE成功但沒有回傳內容
  return res.json();
}

export const api = {
  getHealth: () => fetch(`${BASE}/health`).then(handle),

  getVendors: () => fetch(`${BASE}/catalog/vendors`).then(handle),
  createVendor: (vendor) =>
    fetch(`${BASE}/catalog/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vendor),
    }).then(handle),
  updateVendor: (id, patch) =>
    fetch(`${BASE}/catalog/vendors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),
  deleteVendor: (id) => fetch(`${BASE}/catalog/vendors/${id}`, { method: "DELETE" }).then(handle),

  getStoreItems: () => fetch(`${BASE}/catalog/store-items`).then(handle),
  createStoreItem: (item) =>
    fetch(`${BASE}/catalog/store-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }).then(handle),
  updateStoreItem: (code, patch) =>
    fetch(`${BASE}/catalog/store-items/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),
  deleteStoreItem: (code) => fetch(`${BASE}/catalog/store-items/${code}`, { method: "DELETE" }).then(handle),

  getMappings: () => fetch(`${BASE}/catalog/mappings`).then(handle),
  createMapping: (mapping) =>
    fetch(`${BASE}/catalog/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    }).then(handle),
  updateMapping: (id, patch) =>
    fetch(`${BASE}/catalog/mappings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),
  deleteMapping: (id) => fetch(`${BASE}/catalog/mappings/${id}`, { method: "DELETE" }).then(handle),

  getReceipts: () => fetch(`${BASE}/receipts`).then(handle),
  getReceipt: (id) => fetch(`${BASE}/receipts/${id}`).then(handle),

  // files: 一或多個File，同一張單據的不同頁依順序傳入
  recognizeReceipt: (files) => {
    const form = new FormData();
    for (const file of files) form.append("photos", file);
    return fetch(`${BASE}/receipts/recognize`, { method: "POST", body: form }).then(handle);
  },

  updateLine: (receiptId, lineId, patch) =>
    fetch(`${BASE}/receipts/${receiptId}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),

  deleteLine: (receiptId, lineId) =>
    fetch(`${BASE}/receipts/${receiptId}/lines/${lineId}`, { method: "DELETE" }).then(handle),

  addLine: (receiptId, line) =>
    fetch(`${BASE}/receipts/${receiptId}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(line),
    }).then(handle),

  confirmReceipt: (receiptId) =>
    fetch(`${BASE}/receipts/${receiptId}/confirm`, { method: "POST" }).then(handle),

  reopenReceipt: (receiptId) =>
    fetch(`${BASE}/receipts/${receiptId}/reopen`, { method: "POST" }).then(handle),

  deleteReceipt: (receiptId) =>
    fetch(`${BASE}/receipts/${receiptId}`, { method: "DELETE" }).then(handle),

  exportCsvUrl: () => `${BASE}/receipts/export/csv`,
};
