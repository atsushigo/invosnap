<template>
  <div class="zoom-viewer" :class="{ lightbox: fullscreen }">
    <div class="toolbar">
      <button class="zbtn" @click="zoomOut" title="縮小">−</button>
      <span class="zlabel">{{ Math.round(zoom * 100) }}%</span>
      <button class="zbtn" @click="zoomIn" title="放大">＋</button>
      <button class="zbtn" @click="reset" title="重設">重設</button>
      <button class="zbtn" @click="fullscreen = !fullscreen" title="全螢幕">
        {{ fullscreen ? "關閉全螢幕" : "全螢幕" }}
      </button>
    </div>
    <div
      class="canvas"
      ref="canvas"
      @wheel.prevent="onWheel"
      @mousedown="onDragStart"
      @mousemove="onDragMove"
      @mouseup="onDragEnd"
      @mouseleave="onDragEnd"
      @dblclick="onDoubleClick"
    >
      <img
        :src="src"
        alt="原始送貨單照片"
        draggable="false"
        :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
      />
    </div>
    <p class="hint">滾輪縮放、拖曳平移、雙擊快速放大／還原</p>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";

defineProps({ src: { type: String, required: true } });

const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });
const fullscreen = ref(false);
const dragging = ref(false);
const dragStart = reactive({ x: 0, y: 0, panX: 0, panY: 0 });

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.25, 4);
}
function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.25, 0.5);
}
function reset() {
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
}
function onWheel(event) {
  if (event.deltaY < 0) zoomIn();
  else zoomOut();
}
function onDoubleClick() {
  if (zoom.value > 1) reset();
  else zoom.value = 2;
}
function onDragStart(event) {
  dragging.value = true;
  dragStart.x = event.clientX;
  dragStart.y = event.clientY;
  dragStart.panX = pan.x;
  dragStart.panY = pan.y;
}
function onDragMove(event) {
  if (!dragging.value) return;
  pan.x = dragStart.panX + (event.clientX - dragStart.x);
  pan.y = dragStart.panY + (event.clientY - dragStart.y);
}
function onDragEnd() {
  dragging.value = false;
}
</script>

<style scoped>
.zoom-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.zbtn {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85rem;
}
.zlabel {
  font-size: 0.8rem;
  color: var(--text-dim);
  min-width: 42px;
  text-align: center;
}
.canvas {
  flex: 1;
  overflow: hidden;
  background: #1c1a17;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  min-height: 240px;
}
.canvas:active {
  cursor: grabbing;
}
.canvas img {
  max-width: 100%;
  max-height: 100%;
  transition: transform 0.05s linear;
  user-select: none;
  pointer-events: none;
}
.hint {
  font-size: 0.75rem;
  color: var(--text-dim);
  text-align: center;
  padding: 4px 0;
  margin: 0;
}

.zoom-viewer.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
}
.zoom-viewer.lightbox .canvas {
  min-height: 0;
}
</style>
