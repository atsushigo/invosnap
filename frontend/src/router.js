import { createRouter, createWebHistory } from "vue-router";
import UploadView from "./views/UploadView.vue";
import ReceiptsView from "./views/ReceiptsView.vue";
import ReviewView from "./views/ReviewView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/upload" },
    { path: "/upload", name: "upload", component: UploadView },
    { path: "/receipts", name: "receipts", component: ReceiptsView },
    { path: "/receipts/:id", name: "review", component: ReviewView, props: true },
  ],
});
