<template>
  <div class="app-shell">
    <nav class="topnav">
      <router-link to="/upload" class="brand" @click="menuOpen = false">
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

      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="開啟選單"
        @click="menuOpen = !menuOpen"
      >
        <span></span><span></span><span></span>
      </button>
    </nav>

    <!-- 手機版選單：漢堡按鈕點開的下拉面板，連結是全寬大按鈕，方便手指點 -->
    <div v-if="menuOpen" class="nav-drawer-backdrop" @click="menuOpen = false"></div>
    <div class="nav-drawer" :class="{ open: menuOpen }">
      <router-link to="/upload" @click="menuOpen = false">
        拍照上傳
        <small>掃描並辨識送貨單</small>
      </router-link>
      <router-link to="/receipts" @click="menuOpen = false">
        單據列表
        <small>查看、確認、匯出</small>
      </router-link>
      <router-link to="/catalog" @click="menuOpen = false">
        主檔維護
        <small>新增品項或供應商</small>
      </router-link>
    </div>

    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

const menuOpen = ref(false);
const route = useRoute();
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  }
);
</script>
