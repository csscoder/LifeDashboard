<script setup lang="ts">
import { ref } from 'vue'
import { FieldRoot, FieldLabel } from 'reka-ui'
import { api } from './api'
import UiButton from './ui/UiButton.vue'
import UiTextField from './ui/UiTextField.vue'

const emit = defineEmits<{ paired: [] }>()

const code = ref('')
const message = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  const result = await api.pair(code.value.trim())
  busy.value = false
  if (result.ok) {
    emit('paired')
    return
  }
  message.value =
    result.kind === 'unauthorized'
      ? 'Invalid or expired code'
      : result.kind === 'unavailable'
        ? 'API: unavailable'
        : 'Could not sign in'
}

async function requestCode() {
  const result = await api.pairCode()
  message.value = result.ok
    ? 'The new code is shown in the API terminal or the app window'
    : result.kind === 'rate-limited'
      ? 'Wait a few seconds'
      : 'API: unavailable'
}
</script>

<template>
  <form class="pairing" @submit.prevent="submit">
    <h2 class="pairing__title">Connect to API</h2>
    <FieldRoot class="pairing__label" required>
      <FieldLabel>Pairing code</FieldLabel>
      <UiTextField
        v-model="code"
        class="pairing__input"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="12"
        required
        autofocus
      />
    </FieldRoot>
    <div class="pairing__actions">
      <UiButton type="submit" :disabled="busy">Pair</UiButton>
      <UiButton @click="requestCode">New code</UiButton>
    </div>
    <p class="pairing__message" role="status">{{ message }}</p>
  </form>
</template>

<style scoped>
.pairing {
  display: grid;
  gap: 1rem;
  width: 22rem;
  margin: 4rem auto 0;
  padding: 1.5rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-card);
  background: var(--ld-surface-2);
  color: var(--ld-text-primary);
}

.pairing__title {
  margin: 0;
  font-size: 1.125rem;
}

.pairing__label {
  display: grid;
  gap: 0.5rem;
  color: var(--ld-text-muted);
  font-size: 0.875rem;
}

.pairing__input {
  font-size: 1.25rem;
  letter-spacing: 0.2em;
}

.pairing__actions {
  display: flex;
  gap: 0.75rem;
}

.pairing__message {
  min-height: 1.25rem;
  margin: 0;
  color: var(--ld-text-muted);
  font-size: 0.875rem;
}
</style>
