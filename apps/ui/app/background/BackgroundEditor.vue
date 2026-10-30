<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue'
import { TabsContent } from 'reka-ui'
import { BACKGROUND_PATTERN_SIZES, defaultBackground, defaultYouTubeBackground, type ScreenBackground } from '@lifedashboard/contracts/board'
import { discardMedia, importMedia, mediaInfo } from './media-api'
import { probeMedia } from './import-media'
import { parseYouTubeUrl } from './youtube'
import UiSelect from '../ui/UiSelect.vue'

const QUALITY_OPTIONS = [{ value: 'auto', label: 'Auto' }, { value: '1080', label: '1080p' }, { value: '720', label: '720p' }]
const SHAPE_OPTIONS = [
  { value: 'diagonal', label: 'Diagonal' }, { value: 'circles', label: 'Circles' }, { value: 'squares', label: 'Squares' },
  { value: 'triangles', label: 'Triangles' }, { value: 'diamonds', label: 'Diamonds' }, { value: 'crosses', label: 'Crosses' },
]

const props = defineProps<{ background: ScreenBackground | null; disabled: boolean }>()
const emit = defineEmits<{ change: [background: ScreenBackground | null] }>()
const id = useId()
const filename = ref('')
const youtubeId = computed(() => props.background?.kind === 'youtube' ? props.background.videoId : null)
const phase = ref<'checking' | 'uploading' | null>(null)
const error = ref('')
const patternScale = computed(() => Math.max(1, Math.round(props.background?.pattern.scale ?? 1)))
const patternSize = computed(() => {
  const shape = props.background?.pattern.shape
  if (!shape || shape === 'none') return ''
  const { width, height } = BACKGROUND_PATTERN_SIZES[shape]
  return `${width * patternScale.value}×${height * patternScale.value} px`
})
let active = true
let generation = 0
let metadataGeneration = 0
let controller: AbortController | null = null
let lastPatternShape: Exclude<ScreenBackground['pattern']['shape'], 'none'> = 'diagonal'
watch(() => props.background?.pattern.shape, shape => {
  if (shape && shape !== 'none') lastPatternShape = shape
}, { immediate: true, flush: 'sync' })

watch(() => {
  const background = props.background
  return background && 'mediaId' in background ? background.mediaId : undefined
}, async id => {
  const ticket = ++metadataGeneration
  filename.value = ''
  if (!id) return
  const result = await mediaInfo(id)
  const current = props.background
  const stillReferenced = current && 'mediaId' in current ? current.mediaId : undefined
  if (!active || ticket !== metadataGeneration || stillReferenced !== id) return
  if (result.ok) filename.value = result.data.name
  else error.value = 'Could not read the background details. The file may be unavailable.'
}, { immediate: true })

function cancel() {
  generation++
  controller?.abort()
  controller = null
  phase.value = null
}
watch(() => props.disabled, disabled => { if (disabled) cancel() }, { flush: 'sync' })
onUnmounted(() => { active = false; metadataGeneration++; cancel() })

async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.disabled) return
  cancel()
  const ticket = generation
  const operation = new AbortController()
  controller = operation
  error.value = ''
  phase.value = 'checking'
  const current = () => active && !props.disabled && ticket === generation && !operation.signal.aborted
  try {
    await probeMedia(file, operation.signal)
    if (!current()) return
    phase.value = 'uploading'
    const result = await importMedia(file, operation.signal)
    if (!current()) {
      if (result.ok) void discardMedia(result.data.id)
      return
    }
    if (!result.ok) {
      error.value = 'Could not import the background. Check the connection and the file format.'
      return
    }
    metadataGeneration++
    filename.value = result.data.name
    emit('change', defaultBackground(result.data.id, result.data.mime.startsWith('image/') ? 'image' : 'video'))
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : 'Could not check the background file.'
  } finally {
    if (ticket === generation) {
      phase.value = null
      controller = null
    }
  }
}

function remove() {
  if (props.disabled) return
  cancel()
  metadataGeneration++
  filename.value = ''
  error.value = ''
  emit('change', null)
}
function applyYouTube(event: Event) {
  if (props.disabled) return
  const input = event.target as HTMLInputElement
  if (!input.value.trim()) {
    error.value = ''
    return
  }
  const videoId = parseYouTubeUrl(input.value)
  if (!videoId) {
    error.value = 'Could not read the YouTube link. Paste a youtube.com or youtu.be video address.'
    return
  }
  input.value = ''
  cancel()
  metadataGeneration++
  filename.value = ''
  error.value = ''
  emit('change', defaultYouTubeBackground(videoId))
}
function setQuality(value: string) {
  const current = props.background
  if (props.disabled || current?.kind !== 'youtube') return
  const { quality: _previous, ...auto } = current
  emit('change', value === '720' || value === '1080' ? { ...auto, quality: value } : auto)
}
function set(field: 'opacity' | 'dim', event: Event) {
  if (!props.disabled && props.background)
    emit('change', { ...props.background, [field]: Number((event.target as HTMLInputElement).value) / 100 })
}
function togglePattern(event: Event) {
  if (props.disabled || !props.background) return
  const shape = props.background.pattern.shape
  if (shape !== 'none') lastPatternShape = shape
  emit('change', {
    ...props.background,
    pattern: { ...props.background.pattern, shape: (event.target as HTMLInputElement).checked ? lastPatternShape : 'none' },
  })
}
function setShape(shape: string) {
  if (!props.disabled && props.background)
    emit('change', { ...props.background, pattern: { ...props.background.pattern, shape: shape as ScreenBackground['pattern']['shape'] } })
}
function pattern(field: Exclude<keyof ScreenBackground['pattern'], 'shape'>, event: Event) {
  if (props.disabled || !props.background) return
  const raw = (event.target as HTMLInputElement).value
  const value = field === 'opacity' ? Number(raw) / 100 : field === 'scale' ? Number(raw) : raw
  emit('change', { ...props.background, pattern: { ...props.background.pattern, [field]: value } })
}
</script>

<template>
  <TabsContent value="background" class="background-editor">
    <label class="background-editor__field">
      {{ background ? 'Replace background' : 'Add background' }}
      <input aria-label="Background file" type="file" accept="video/*,image/png,image/jpeg,image/webp,image/avif,.mp4,.m4v,.mov,.webm,.png,.jpg,.jpeg,.webp,.avif" :disabled="disabled" @change="choose">
    </label>
    <p v-if="filename" class="background-editor__filename" :title="filename">{{ filename }}</p>
    <p v-if="youtubeId" class="background-editor__filename">YouTube · {{ youtubeId }}</p>
    <label class="background-editor__field">
      {{ youtubeId ? 'Replace YouTube link' : 'YouTube background' }}
      <input aria-label="YouTube link" type="url" placeholder="https://www.youtube.com/watch?v=…" :disabled="disabled" @change="applyYouTube">
    </label>
    <p v-if="phase" role="status" aria-live="polite" class="background-editor__hint">{{ phase === 'checking' ? 'Checking the file…' : 'Importing the background…' }}</p>
    <button v-if="phase" type="button" :disabled="disabled" @click="cancel">Cancel import</button>
    <p v-if="error" role="alert" class="background-editor__error">{{ error }}</p>
    <p class="background-editor__hint">Video: MP4, M4V, MOV, WebM. Images: PNG, JPEG, WebP, AVIF. A copy is kept in the app. Video plays muted. YouTube plays muted and looped; the desktop app presses Skip when it appears.</p>
    <template v-if="background">
      <div v-if="background.kind === 'youtube'" class="background-editor__field">
        <label :for="`${id}-quality`">Video quality</label>
        <UiSelect :id="`${id}-quality`" aria-label="Video quality" :model-value="background.quality ?? 'auto'" :options="QUALITY_OPTIONS" :disabled="disabled" @update:model-value="setQuality" />
      </div>
      <label class="background-editor__field">
        <span>{{ background.kind === 'image' ? 'Image opacity' : 'Video opacity' }} <output>{{ Math.round(background.opacity * 100) }}%</output></span>
        <input :aria-label="background.kind === 'image' ? 'Image opacity' : 'Video opacity'" type="range" min="0" max="100" step="1" :value="background.opacity * 100" :disabled="disabled" @input="set('opacity', $event)">
      </label>
      <button type="button" :disabled="disabled" @click="remove">Remove background</button>
    </template>
  </TabsContent>
  <TabsContent v-if="background" value="overlay" class="background-editor">
    <label class="background-editor__field">
      <span>Dimming <output>{{ Math.round(background.dim * 100) }}%</output></span>
      <input aria-label="Dimming" type="range" min="0" max="100" step="1" :value="background.dim * 100" :disabled="disabled" @input="set('dim', $event)">
    </label>
    <label class="background-editor__toggle">
      <input aria-label="Pattern over the background" type="checkbox" :checked="background.pattern.shape !== 'none'" :disabled="disabled" @change="togglePattern">
      Pattern over the background
    </label>
    <template v-if="background.pattern.shape !== 'none'">
      <div class="background-editor__field">
        <label :for="`${id}-shape`">Pattern shape</label>
        <UiSelect :id="`${id}-shape`" aria-label="Pattern shape" :model-value="background.pattern.shape" :options="SHAPE_OPTIONS" :disabled="disabled" @update:model-value="setShape" />
      </div>
      <label class="background-editor__color">
        Pattern color
        <input aria-label="Pattern color" type="color" :value="background.pattern.color" :disabled="disabled" @input="pattern('color', $event)">
      </label>
      <label class="background-editor__field">
        <span>Pattern opacity <output>{{ Math.round(background.pattern.opacity * 100) }}%</output></span>
        <input aria-label="Pattern opacity" type="range" min="0" max="100" step="1" :value="background.pattern.opacity * 100" :disabled="disabled" @input="pattern('opacity', $event)">
      </label>
      <label class="background-editor__field">
        <span>Pattern scale <output>{{ patternSize }}</output></span>
        <input aria-label="Pattern scale" type="range" min="1" max="4" step="1" :value="patternScale" :disabled="disabled" @input="pattern('scale', $event)">
      </label>
    </template>
  </TabsContent>
</template>

<style scoped>
.background-editor { display: grid; gap: 0.625rem; }
.background-editor[hidden] { display: none; }
p { margin: 0; }
.background-editor__field { display: grid; gap: 0.375rem; color: var(--ld-text-muted); min-width: 0; }
.background-editor__field > span, .background-editor__color { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
output { color: var(--ld-text-secondary); font-variant-numeric: tabular-nums; }
input, button { min-width: 0; max-width: 100%; font: inherit; }
input[type='file'] { width: 100%; font-size: 0.75rem; }
input[type='file']::file-selector-button, button { padding: 0.5rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); color: var(--ld-text-primary); cursor: pointer; }
input[type='range'] { width: 100%; margin: 0; accent-color: var(--ld-accent); }
input[type='color'] { width: 3rem; height: 2rem; padding: 0.125rem; border: var(--ld-border-width) solid var(--ld-border-default); border-radius: var(--ld-radius-control); background: var(--ld-surface-3); cursor: pointer; }
.background-editor__color { color: var(--ld-text-muted); }
.background-editor__toggle { display: flex; align-items: center; gap: 0.5rem; color: var(--ld-text-secondary); }
input[type='checkbox'] { accent-color: var(--ld-accent); }
.background-editor__hint { color: var(--ld-text-muted); font-size: 0.75rem; }
.background-editor__filename { overflow-wrap: anywhere; color: var(--ld-text-secondary); }
.background-editor__error { color: var(--ld-danger-text); }
:disabled { opacity: 0.5; cursor: default; }
:focus-visible { outline: 0.125rem solid var(--ld-focus-ring); outline-offset: 0.125rem; }
</style>
