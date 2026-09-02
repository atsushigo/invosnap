<template>
  <div class="app-shell">
    <nav class="topnav">
      <span class="brand">InvoSnap 進貨快照</span>
      <router-link to="/upload">拍照上傳</router-link>
      <router-link to="/receipts">單據列表</router-link>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>
