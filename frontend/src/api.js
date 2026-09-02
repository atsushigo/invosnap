const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `請求失敗 (${res.status})`);
  }
  return res.json();
}

export const api = {
  getHealth: () => fetch(`${BASE}/health`).then(handle),

  getVendors: () => fetch(`${BASE}/catalog/vendors`).then(handle),
  getStoreItems: () => fetch(`${BASE}/catalog/store-items`).then(handle),
  getMappings: () => fetch(`${BASE}/catalog/mappings`).then(handle),

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

  exportCsvUrl: () => `${BASE}/receipts/export/csv`,
};
