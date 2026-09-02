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

  recognizeReceipt: (file) => {
    const form = new FormData();
    form.append("photo", file);
    return fetch(`${BASE}/receipts/recognize`, { method: "POST", body: form }).then(handle);
  },

  updateLine: (receiptId, lineId, patch) =>
    fetch(`${BASE}/receipts/${receiptId}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),

  confirmReceipt: (receiptId) =>
    fetch(`${BASE}/receipts/${receiptId}/confirm`, { method: "POST" }).then(handle),

  exportCsvUrl: () => `${BASE}/receipts/export/csv`,
};
