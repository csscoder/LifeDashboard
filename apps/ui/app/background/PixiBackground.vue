<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ScreenBackground } from '@lifedashboard/contracts/board'
import type { createBackgroundRenderer } from './renderer'
import { YOUTUBE_ORIGIN, youtubeEmbedUrl, youtubeFrameStyle } from './youtube'

const props = defineProps<{ background: ScreenBackground | null }>()
const emit = defineEmits<{ error: [message: string | null] }>()
const host = ref<HTMLElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const youtube = computed(() => props.background?.kind === 'youtube' ? props.background : null)
const embedUrl = computed(() => youtube.value ? youtubeEmbedUrl(youtube.value.videoId, !reducedMotion.matches) : null)
const measureViewport = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 })
const viewport = ref(measureViewport())
const frameStyle = computed(() => ({
  opacity: youtube.value?.opacity ?? 1,
  ...(youtube.value?.quality && youtubeFrameStyle(youtube.value.quality, viewport.value)),
}))
let renderer: Awaited<ReturnType<typeof createBackgroundRenderer>> | null = null
let creating = false
let disposed = false

async function update() {
  if (disposed || !host.value || creating) return
  try {
    if (!renderer) {
      if (!props.background) return
      creating = true
      const { createBackgroundRenderer } = await import('./renderer')
      if (disposed) return
      const initialized = await createBackgroundRenderer(host.value, message => {
        if (!disposed) emit('error', message)
      })
      if (disposed) { initialized.destroy(); return }
      renderer = initialized
      creating = false
    }
    await renderer.setBackground(props.background)
  } catch {
    if (!disposed) emit('error', 'Could not show the background. Using the theme background.')
  } finally { creating = false }
}
// The embed plays on its own, so the renderer's hidden-page and reduced-motion pause cannot reach it.
function syncYouTube() {
  const func = document.hidden || reducedMotion.matches ? 'pauseVideo' : 'playVideo'
  frame.value?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YOUTUBE_ORIGIN)
}
function viewportChanged() { viewport.value = measureViewport() }
onMounted(() => {
  window.addEventListener('resize', viewportChanged)
  document.addEventListener('visibilitychange', syncYouTube)
  reducedMotion.addEventListener('change', syncYouTube)
  watch(() => props.background, () => { void update() }, { immediate: true, deep: true })
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', viewportChanged)
  document.removeEventListener('visibilitychange', syncYouTube)
  reducedMotion.removeEventListener('change', syncYouTube)
  renderer?.destroy()
})
</script>

<template>
  <div ref="host" class="video-background" aria-hidden="true">
    <iframe
      v-if="embedUrl" ref="frame" :key="`${embedUrl}:${youtube?.quality}`" :src="embedUrl" class="video-background__youtube"
      :style="frameStyle" allow="autoplay; encrypted-media" tabindex="-1" @load="syncYouTube"
    />
  </div>
</template>

<style scoped>
.video-background { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
/* shortcut: cover assumes 16:9, so Shorts and 4:3 keep inner bars until the real ratio is known. */
.video-background__youtube { position: absolute; top: 50%; left: 50%; width: max(100vw, 177.78vh); height: max(100vh, 56.25vw); border: 0; transform: translate(-50%, -50%); }
.video-background :deep(canvas) { position: absolute; inset: 0; z-index: 1; display: block; width: 100%; height: 100%; }
.video-background :deep(canvas[hidden]) { display: none; }
</style>
