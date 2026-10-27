<script setup lang="ts">
import { computed, useId } from 'vue'
import { normalizeConfig, type SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import UiSelect from '../../../../ui/UiSelect.vue'
import { offsetGroups, offsetLabel } from './time-zones'

// The clock's own settings form: the notation and the zone lists only appear once the system time is off.
const props = defineProps<{
  schema: SettingsSchema
  config: Record<string, unknown>
}>()
const emit = defineEmits<{ change: [config: Record<string, unknown>] }>()
const uid = useId()
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

const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value

function pickOffset(value: string) {
  const next = groups.find((item) => item.offset === Number(value))
  if (next) set({ zone: next.zones[0] })
}
</script>

<template>
  <div class="settings__config">
    <label class="settings__row">
      <span class="settings__label">System time</span>
      <input type="checkbox" :checked="values.systemTime" @change="set({ systemTime: ($event.target as HTMLInputElement).checked })" />
    </label>
    <template v-if="!values.systemTime">
      <div class="settings__row" role="radiogroup" :aria-labelledby="`${uid}-notation`">
        <span :id="`${uid}-notation`" class="settings__label">Notation</span>
        <span class="settings__choices">
          <label v-for="item in ['UTC', 'GMT']" :key="item" class="settings__choice">
            <input type="radio" :name="`${uid}-notation`" :value="item" :checked="values.notation === item" @change="set({ notation: valueOf($event) })" />{{ item }}
          </label>
        </span>
      </div>
      <div class="settings__row">
        <label class="settings__label" :for="`${uid}-offset`">Offset</label>
        <UiSelect :id="`${uid}-offset`" :model-value="String(group.offset)" :options="offsetOptions" @update:model-value="pickOffset" />
      </div>
      <div class="settings__row">
        <label class="settings__label" :for="`${uid}-zone`">Time zone</label>
        <UiSelect :id="`${uid}-zone`" :model-value="values.zone" :options="zoneOptions" @update:model-value="set({ zone: $event })" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings__config {
  display: grid;
  gap: 0.375rem;
  padding-top: 0.5rem;
  border-top: var(--ld-border-width) solid var(--ld-border-default);
}

.settings__row {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
}

.settings__row > input[type='checkbox'] {
  justify-self: start;
  margin: 0;
}

.settings__label {
  color: var(--ld-text-secondary);
}

.settings__choices {
  display: flex;
  gap: 0.75rem;
}

.settings__choice {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
