<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { normalizeConfig, SETTINGS_LIMITS, type PlainSetting, type SettingsSchema } from '@lifedashboard/contracts/widget-settings'
import { SECRET_MIN_LENGTH } from '@lifedashboard/contracts/widget-secrets'
import { api } from '../api'
import UiSelect from '../ui/UiSelect.vue'
import UiTextField from '../ui/UiTextField.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import UiSwitch from '../ui/UiSwitch.vue'
import UiColorField from '../ui/UiColorField.vue'
import UiButton from '../ui/UiButton.vue'
import SettingsRow from './SettingsRow.vue'
import { refreshSecretFlags } from '../widgets/secret-flags'
import { controlFor, isRequiredSetting, mergeConfigField, parseFieldInput, secretStatusMessage } from './config-form'

const props = defineProps<{
  schema: SettingsSchema
  config: Record<string, unknown>
  widgetId: string | null
  secrets: ReadonlySet<string>
}>()
const emit = defineEmits<{ change: [config: Record<string, unknown>] }>()
const draft = shallowRef(props.config)
watch([() => props.config, () => props.schema, () => props.widgetId], () => {
  draft.value = props.config
}, { flush: 'sync' })
const values = computed(() => normalizeConfig(props.schema, draft.value, props.secrets))
// Setting keys may match Object.prototype names.
const passwords = ref<Record<string, string>>(Object.create(null))
const pending = ref<Record<string, boolean>>(Object.create(null))
const messages = ref<Record<string, string | null>>(Object.create(null))
const missing = ref(false)
const controlRevisions = ref<Record<string, number>>(Object.create(null))
let revision = 0

watch(() => props.widgetId, () => {
  revision++
  passwords.value = Object.create(null)
  pending.value = Object.create(null)
  messages.value = Object.create(null)
  missing.value = false
})

function changeField(key: string, setting: PlainSetting, raw: string | number | boolean) {
  const parsed = parseFieldInput(setting, typeof raw === 'number' ? String(raw) : raw)
  if (!parsed.ok) {
    controlRevisions.value[key] = (controlRevisions.value[key] ?? 0) + 1
    return
  }
  draft.value = mergeConfigField(props.schema, values.value, key, parsed.value)
  emit('change', draft.value)
}

async function changeSecret(key: string, clear: boolean) {
  const id = props.widgetId
  if (!id || missing.value || pending.value[key]) return
  const current = revision
  pending.value[key] = true
  const result = clear
    ? await api.clearWidgetSecret(id, key)
    : await api.setWidgetSecret(id, key, passwords.value[key] ?? '')
  if (result.ok) refreshSecretFlags(id, result.data)
  if (current !== revision) return
  pending.value[key] = false
  messages.value[key] = secretStatusMessage(result)
  if (result.ok) passwords.value[key] = ''
  else if (result.kind === 'invalid' && result.code === 'NOT_FOUND') missing.value = true
}

function messageFor(key: string): string | null {
  return !props.widgetId || missing.value ? secretStatusMessage(null) : messages.value[key] ?? null
}
</script>

<template>
  <div class="settings__config">
    <SettingsRow
      v-for="(setting, key) in schema.properties" :key="key"
      :label="setting.title" :required="isRequiredSetting(schema, key)"
      :description="setting.description"
      :value="setting.type === 'secret' ? (secrets.has(key) ? 'set' : 'not set') : undefined"
      :warning="setting.type === 'secret' && isRequiredSetting(schema, key) && !secrets.has(key)"
      :error="setting.type === 'secret' ? messageFor(key) : null"
    >
      <template v-if="setting.type === 'secret'">
        <UiTextField
          :model-value="passwords[key] ?? ''" @update:model-value="passwords[key] = $event" type="password" autocomplete="new-password"
          :minlength="SECRET_MIN_LENGTH" :disabled="!widgetId || missing || pending[key]"
          :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        />
        <div class="settings__actions">
          <UiButton :disabled="!widgetId || missing || pending[key] || (passwords[key]?.length ?? 0) < SECRET_MIN_LENGTH" @click="changeSecret(key, false)">Set</UiButton>
          <UiButton :disabled="!widgetId || missing || pending[key] || !secrets.has(key)" @click="changeSecret(key, true)">Clear</UiButton>
        </div>
        <p v-if="(passwords[key]?.length ?? 0) > 0 && (passwords[key]?.length ?? 0) < SECRET_MIN_LENGTH" class="settings__message" role="status">At least {{ SECRET_MIN_LENGTH }} characters</p>
      </template>
      <UiSelect
        v-else-if="controlFor(setting) === 'select'" :model-value="String(values[key])"
        :options="(setting.enum ?? []).map((option) => ({ value: option, label: option }))"
        :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        @update:model-value="changeField(key, setting, $event)"
      />
      <UiSwitch
        v-else-if="setting.type === 'boolean'" :model-value="values[key] === true"
        :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        @update:model-value="changeField(key, setting, $event)"
      />
      <UiNumberField
        v-else-if="setting.type === 'integer' || setting.type === 'number'"
        :model-value="Number(values[key])" :integer="setting.type === 'integer'" stepper :min="setting.minimum" :max="setting.maximum"
        :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        @update:model-value="changeField(key, setting, $event)"
      />
      <UiColorField
        v-else-if="setting.type === 'color'" :model-value="String(values[key])"
        :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        @update:model-value="changeField(key, setting, $event)"
      />
      <UiTextField
        v-else :key="controlRevisions[key] ?? 0" :model-value="String(values[key])" :maxlength="setting.maxLength ?? SETTINGS_LIMITS.maxLength"
        :aria-required="isRequiredSetting(schema, key) ? 'true' : undefined"
        @commit="changeField(key, setting, $event)"
      />
    </SettingsRow>
  </div>
</template>

<style scoped>
.settings__config { display: grid; gap: 0.375rem; }
.settings__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; grid-column: 1 / -1; }
.settings__message { grid-column: 1 / -1; margin: 0.125rem 0 0; font-size: 0.75rem; line-height: 1rem; color: var(--ld-text-secondary); }
</style>
