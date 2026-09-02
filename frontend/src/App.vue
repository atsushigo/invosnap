<template>
  <div class="app-shell">
    <nav class="topnav">
      <router-link to="/upload" class="brand">
        <span class="brand-mark">IS</span>
        <span class="brand-text">
          <strong>InvoSnap</strong>
          <small>進貨快照</small>
        </span>
      </router-link>
      <div class="nav-links">
        <router-link to="/upload">拍照上傳</router-link>
        <router-link to="/receipts">單據列表</router-link>
        <router-link to="/catalog">主檔維護</router-link>
      </div>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>
