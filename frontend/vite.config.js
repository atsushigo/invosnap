import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
    // 允許透過 Cloudflare Quick Tunnel（trycloudflare.com，臨時網址每次啟動都不同）
    // 分享畫面給店長看，僅供本機開發/臨時展示使用，正式上線後不會用這個機制
    allowedHosts: [".trycloudflare.com"],
  },
});
