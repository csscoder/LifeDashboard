import { computed, mergeProps, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { injectFieldRootContext } from 'reka-ui'

// These Reka controls do not yet participate in FieldRoot.
// Keep the bridge optional so these controls also work outside settings forms.
export function useFieldBridge(props: { modelValue: number | boolean | string; disabled?: boolean }) {
  const field = injectFieldRootContext(null)
  const attrs = useAttrs()
  const control = ref<{ $el: HTMLElement } | null>(null)
  const disabled = computed(() => Boolean(props.disabled || field?.disabled.value))
  const id = () => attrs.id as string | undefined ?? field?.fieldId.value
  const mergeIds = (consumer: unknown, owned: string | undefined) => [consumer, owned].filter(Boolean).join(' ') || undefined
  function bindings() {
    if (!field) return attrs
    return mergeProps(attrs, {
      ...field.dataAttributes.value,
      id: id(),
      'aria-labelledby': mergeIds(attrs['aria-labelledby'], field.labelId.value),
      'aria-describedby': mergeIds(attrs['aria-describedby'], field.describedBy.value),
      'aria-invalid': attrs['aria-invalid'] ?? (field.invalid.value && !disabled.value || undefined),
      'aria-required': attrs['aria-required'] ?? (field.required.value || undefined),
      onFocus: () => field.handleControlFocus(),
      onBlur: () => field.handleControlBlur(),
    })
  }
  let unregister: (() => void) | undefined
  onMounted(() => {
    unregister = field?.registerControl({
      id, element: () => control.value?.$el,
      getValue: () => props.modelValue,
      required: () => field.required.value,
    })
  })
  onBeforeUnmount(() => unregister?.())
  watch(() => props.modelValue, value => field?.handleControlInput({ value }), { flush: 'post' })
  return { control, disabled, bindings }
}
