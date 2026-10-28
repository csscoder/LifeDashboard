<script setup lang="ts">
import { computed } from 'vue'
import { normalizeConfig, type SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import SettingsRow from '../../../../board/SettingsRow.vue'
import UiSwitch from '../../../../ui/UiSwitch.vue'
import UiRadioGroup from '../../../../ui/UiRadioGroup.vue'
import UiSelect from '../../../../ui/UiSelect.vue'
import { offsetGroups, offsetLabel } from './time-zones'

// The clock's own settings form: the notation and the zone lists only appear once the system time is off.
const props = defineProps<{
  schema: SettingsSchema
  config: Record<string, unknown>
}>()
const emit = defineEmits<{ change: [config: Record<string, unknown>] }>()
const NO_SECRETS: ReadonlySet<string> = new Set()
// Grouped by today's offsets, so a zone with summer time moves between groups with the seasons.
const groups = offsetGroups(new Date())
const values = computed(() => normalizeConfig(props.schema, props.config, NO_SECRETS) as { systemTime: boolean; notation: string; zone: string })
const group = computed(() => groups.find((item) => item.zones.includes(values.value.zone)) ?? groups.find((item) => item.offset === 0)!)
const offsetOptions = computed(() => groups.map((item) => ({ value: String(item.offset), label: offsetLabel(item.offset, values.value.notation) })))
const zoneOptions = computed(() => group.value.zones.map((zone) => ({ value: zone, label: zone })))

function set(patch: Record<string, unknown>) {
  emit('change', { ...values.value, ...patch })
}

function pickOffset(value: string) {
  const next = groups.find((item) => item.offset === Number(value))
  if (next) set({ zone: next.zones[0] })
}
</script>

<template>
  <div class="clock-settings">
    <SettingsRow label="System time"><UiSwitch :model-value="values.systemTime" @update:model-value="set({ systemTime: $event })" /></SettingsRow>
    <template v-if="!values.systemTime">
      <SettingsRow label="Notation"><UiRadioGroup aria-label="Notation" :model-value="values.notation" :options="['UTC', 'GMT'].map(value => ({ value, label: value }))" @update:model-value="set({ notation: $event })" /></SettingsRow>
      <SettingsRow label="Offset"><UiSelect :model-value="String(group.offset)" :options="offsetOptions" @update:model-value="pickOffset" /></SettingsRow>
      <SettingsRow label="Time zone"><UiSelect :model-value="values.zone" :options="zoneOptions" @update:model-value="set({ zone: $event })" /></SettingsRow>
    </template>
  </div>
</template>

<style scoped>
.clock-settings { display: grid; gap: 0.375rem; }
</style>
