<script setup lang="ts">
import { useWidget } from '@lifedashboard/widget-sdk'

// The size comes from useWidget(), like in an installed package (acceptance 6).
const { context } = useWidget()
</script>

<template>
  <div class="grid place-items-center h-full font-strong text-secondary">{{ context.size.w }}×{{ context.size.h }}</div>
</template>

<style scoped>
/* em, not the rem-based text-2xl utility: follows the widget text size. The root div is the only element. */
@layer ld.widget {
  div {
    font-size: 1.5em;
    line-height: calc(4 / 3);
  }
}
</style>
