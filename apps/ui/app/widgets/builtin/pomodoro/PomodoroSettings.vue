<script setup lang="ts">
import { ref } from 'vue'
import { FOCUS_LIMITS, type FocusSettings } from '@lifedashboard/contracts/focus'
import { focusStore } from '../../../focus/store'
import SettingsRow from '../../../board/SettingsRow.vue'
import UiNumberField from '../../../ui/UiNumberField.vue'
import UiSwitch from '../../../ui/UiSwitch.vue'

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

function set(patch: Partial<FocusSettings>) {
  error.value = focusStore.saveSettings({ ...state.settings, ...patch })
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
