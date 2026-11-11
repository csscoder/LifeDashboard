<script setup lang="ts">
import { computed, ref } from 'vue'
import { FOCUS_LIMITS, type FocusSettings } from '@lifedashboard/contracts/focus'
import { focusStore } from '../../../focus/store'
import SettingsRow from '../../../board/SettingsRow.vue'
import UiNumberField from '../../../ui/UiNumberField.vue'
import UiSwitch from '../../../ui/UiSwitch.vue'
import UiRadioGroup from '../../../ui/UiRadioGroup.vue'
import UiSelect from '../../../ui/UiSelect.vue'
import { offsetGroups, offsetLabel } from '../clocks/analog_1/time-zones'

// Focus settings are global: this editor writes to the focus store and ignores the instance config and schema.
// Declared anyway (change is never emitted), so the panel's bindings never fall through to the root as a native change listener.
defineProps<{ schema?: unknown; config?: Record<string, unknown> }>()
defineEmits<{ change: [config: Record<string, unknown>] }>()
const state = focusStore.state
const error = ref<string | null>(null)
const numbers = [
  ['Focus, min', 'focusMin'],
  ['Short break, min', 'shortBreakMin'],
  ['Long break, min', 'longBreakMin'],
  ['Long break after', 'longBreakEvery'],
  ['Daily goal', 'dailyGoal'],
] as const
const switches = [['Auto-start breaks', 'autoStartBreak'], ['Auto-start focus', 'autoStartFocus'], ['Sound', 'sound']] as const

// The daily reset zone, picked as on the clock: grouped by today's offsets; an unknown zone shows the UTC group.
const groups = offsetGroups(new Date())
const group = computed(() => groups.find((item) => item.zones.includes(state.settings.zone)) ?? groups.find((item) => item.offset === 0)!)
const notations = ['UTC', 'GMT'].map((value) => ({ value, label: value }))
const offsetOptions = computed(() => groups.map((item) => ({ value: String(item.offset), label: offsetLabel(item.offset, state.settings.notation) })))
const zoneOptions = computed(() => group.value.zones.map((zone) => ({ value: zone, label: zone })))

function set(patch: Partial<FocusSettings>) {
  error.value = focusStore.saveSettings({ ...state.settings, ...patch })
}

function pickOffset(value: string) {
  const next = groups.find((item) => item.offset === Number(value))
  if (next) set({ zone: next.zones[0] })
}
</script>

<template>
  <div class="pomodoro-settings">
    <SettingsRow v-for="[label, key] in numbers" :key="key" :label="label">
      <UiNumberField :model-value="state.settings[key]" integer stepper :min="FOCUS_LIMITS[key][0]" :max="FOCUS_LIMITS[key][1]" @update:model-value="set({ [key]: $event })" />
    </SettingsRow>
    <SettingsRow v-for="[label, key] in switches" :key="key" :label="label">
      <UiSwitch :model-value="state.settings[key]" @update:model-value="set({ [key]: $event })" />
    </SettingsRow>
    <SettingsRow label="System time"><UiSwitch :model-value="state.settings.systemTime" @update:model-value="set({ systemTime: $event })" /></SettingsRow>
    <template v-if="!state.settings.systemTime">
      <SettingsRow label="Notation"><UiRadioGroup aria-label="Notation" :model-value="state.settings.notation" :options="notations" @update:model-value="set({ notation: $event as FocusSettings['notation'] })" /></SettingsRow>
      <SettingsRow label="Offset"><UiSelect :model-value="String(group.offset)" :options="offsetOptions" @update:model-value="pickOffset" /></SettingsRow>
      <SettingsRow label="Time zone"><UiSelect :model-value="state.settings.zone" :options="zoneOptions" @update:model-value="set({ zone: $event })" /></SettingsRow>
    </template>
    <p class="pomodoro-settings__note">Shared by all Pomodoro widgets</p>
    <p v-if="error" class="pomodoro-settings__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.pomodoro-settings { display: grid; gap: 0.375rem; }
.pomodoro-settings__note, .pomodoro-settings__error { margin: 0.125rem 0 0; font-size: 0.75rem; line-height: 1rem; }
.pomodoro-settings__note { color: var(--ld-text-secondary); }
.pomodoro-settings__error { color: var(--ld-warning-text); }
</style>
