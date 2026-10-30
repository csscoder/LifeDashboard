<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { Grant, GrantMode, PackageInspection, WidgetPermission } from '@lifedashboard/contracts/widget-package'
import { secretsOf } from '@lifedashboard/contracts/widget-secrets'
import { api, type ApiFailure } from '../api'
import { bindingLine } from './secret-binding'
import { AGENT_TASK, CREATE_COMMAND } from './starter-prompt'
import UiSelect from '../ui/UiSelect.vue'
import {
  CONFIRMABLE_PERMISSIONS,
  describeInstallFailure,
  describeUploadFailure,
  filesFromEntry,
  filesFromInput,
  formatBytes,
  initialModes,
  installedPackages,
  loadPackages,
  readFolder,
  relaxedPermissions,
  savedMode,
  uploadFiles,
  type GrantModes,
  type PickedFile,
} from './catalog'

const open = defineModel<boolean>('open', { required: true })

const PERMISSIONS: Record<WidgetPermission, string> = {
  state: 'Store its own data',
  notifications: 'Show notifications',
  network: 'Network access',
}
const MODES: Record<GrantMode, string> = {
  ask: 'Ask every time',
  allow: 'Allow',
}
const MODE_OPTIONS = Object.entries(MODES).map(([value, label]) => ({ value, label }))
const modeId = (packageId: string, grant: Grant) => `mode-${packageId}-${grant.permission}`
const VERSION_CONFLICT = 'This version is already installed with different contents'
const TOO_MANY_UPLOADS = 'Too many unfinished installs, try again later'

// Template ref keys differ from setup bindings (see WidgetBoard.vue).
const dialog = useTemplateRef<HTMLDialogElement>('dialogBox')
const folderInput = useTemplateRef<HTMLInputElement>('folderBox')
const message = ref<string | null>(null)
const busy = ref(false)
// The created upload and its files; the review screen shows while it is set.
const pending = ref<{ uploadId: string; inspection: PackageInspection; files: PickedFile[] } | null>(null)
// Files not sent yet; a retry sends only these.
const remaining = ref<PickedFile[]>([])
const progress = ref<{ sent: number; total: number } | null>(null)
const failedPath = ref<string | null>(null)
const confirmDelete = ref<string | null>(null)
let controller: AbortController | null = null
// Bumped by every start and cancel: an answer from an older run is discarded.
let run = 0
// Modes the user picks for new confirmable permissions on the install screen.
const modes = ref<GrantModes>({})

const manifest = computed(() => pending.value?.inspection.manifest ?? null)
const secretBindings = computed(() => secretsOf(manifest.value?.settings))
const isUpdate = computed(() => installedPackages.value.some((pkg) => pkg.id === manifest.value?.id))
const heldGrants = computed(() => installedPackages.value.find((pkg) => pkg.id === manifest.value?.id)?.grants ?? [])

function permissionList(permissions: readonly WidgetPermission[]): string {
  return permissions.map((permission) => PERMISSIONS[permission]).join(', ')
}

function failureText(failure: ApiFailure, conflict: string): string {
  if (failure.kind === 'invalid') return `Package rejected: ${failure.message}`
  if (failure.kind === 'conflict') return conflict
  return 'Could not reach the API'
}

watch(
  open,
  (value) => {
    if (!value) {
      cancel()
      dialog.value?.close()
      return
    }
    message.value = null
    pending.value = null
    void loadPackages(api)
    dialog.value?.showModal()
  },
  { flush: 'post' },
)

async function start(files: PickedFile[]) {
  if (busy.value) return
  if (pending.value) cancel()
  const mine = ++run
  // Set before the first await so an overlapping start is rejected; a stale run never touches `busy` (cancel reset it).
  busy.value = true
  message.value = null
  const read = await readFolder(files)
  if (mine !== run) return
  if (!read.ok) {
    busy.value = false
    message.value = read.message
    return
  }
  const result = await api.createUpload(read.manifest, read.files)
  if (mine !== run) {
    // The dialog closed or another folder replaced this run: release the session nobody owns.
    if (result.ok) void api.cancelUpload(result.data.uploadId)
    return
  }
  busy.value = false
  if (!result.ok) {
    message.value = failureText(result, TOO_MANY_UPLOADS)
    return
  }
  pending.value = { uploadId: result.data.uploadId, inspection: result.data.inspection, files: read.picked }
  remaining.value = read.picked
  progress.value = null
  failedPath.value = null
  modes.value = initialModes(result.data.inspection.newPermissions)
}

function chooseFolder(event: Event) {
  const input = event.target as HTMLInputElement
  const files = filesFromInput(input.files ?? [])
  input.value = ''
  if (files.length > 0) void start(files)
}

async function dropFolder(event: DragEvent) {
  if (busy.value) return
  const entry = event.dataTransfer?.items[0]?.webkitGetAsEntry()
  if (!entry?.isDirectory) {
    message.value = 'Drop a widget folder'
    return
  }
  await start(await filesFromEntry(entry as FileSystemDirectoryEntry))
}

async function install() {
  const current = pending.value
  if (!current) return
  busy.value = true
  failedPath.value = null
  message.value = null
  const own = (controller = new AbortController())
  const total = current.files.reduce((sum, item) => sum + item.file.size, 0)
  progress.value ??= { sent: 0, total }
  const sent = await uploadFiles(api, current.uploadId, remaining.value, own.signal, (file) => {
    if (own.signal.aborted) return
    remaining.value = remaining.value.filter((item) => item !== file)
    progress.value = { sent: progress.value!.sent + file.file.size, total }
  })
  // «Cancel» already reset the screen.
  if (own.signal.aborted) return
  if (!sent.ok) {
    busy.value = false
    failedPath.value = sent.path
    const failure = describeUploadFailure(sent)
    if (failure.restart) pending.value = null
    message.value = failure.message
    return
  }
  const result = await api.installUpload(current.uploadId, own.signal)
  if (own.signal.aborted) return
  if (!result.ok) {
    busy.value = false
    pending.value = null
    message.value = describeInstallFailure(result) ?? failureText(result, VERSION_CONFLICT)
    return
  }
  // New confirmable grants come out as «ask»; a failed PUT leaves that safer mode.
  const relaxed = relaxedPermissions(current.inspection.newPermissions, modes.value)
  const saved = await Promise.all(relaxed.map((permission) => api.setGrantMode(current.inspection.manifest.id, permission, 'allow')))
  busy.value = false
  pending.value = null
  progress.value = null
  message.value = saved.every((item) => item.ok) ? 'Widget installed' : 'Widget installed, but the «Allow» mode was not saved'
  await loadPackages(api)
}

function cancel() {
  run++
  controller?.abort()
  if (pending.value) void api.cancelUpload(pending.value.uploadId)
  pending.value = null
  progress.value = null
  busy.value = false
}

async function copy(path: string) {
  try {
    await navigator.clipboard.writeText(path)
  } catch {
    // A refused clipboard leaves the selectable <code> text as the fallback.
  }
}

async function remove(id: string) {
  // The first click asks; the confirmation block calls this again.
  if (confirmDelete.value !== id) {
    confirmDelete.value = id
    return
  }
  confirmDelete.value = null
  busy.value = true
  const result = await api.deletePackage(id)
  busy.value = false
  if (!result.ok) {
    message.value = failureText(result, 'The widget is on a board; remove it from the board first')
    return
  }
  message.value = null
  await loadPackages(api)
}

async function changeMode(packageId: string, grant: Grant, mode: string) {
  busy.value = true
  const result = await api.setGrantMode(packageId, grant.permission, mode as GrantMode)
  if (result.ok) {
    message.value = null
    await loadPackages(api)
  } else {
    // The select stays bound to the saved mode.
    message.value = 'Could not save the mode'
  }
  busy.value = false
  // The select was disabled during the request; give keyboard focus back once it is enabled.
  await nextTick()
  document.getElementById(modeId(packageId, grant))?.focus()
}
</script>

<template>
  <dialog ref="dialogBox" class="packages" aria-labelledby="packages-title" @close="open = false" @dragover.prevent @drop.prevent="dropFolder">
    <template v-if="pending && manifest">
      <h2 id="packages-title" class="packages__title">Install widget</h2>
      <dl class="packages__facts">
        <dt>Name</dt>
        <dd>{{ manifest.title }}</dd>
        <dt>Author</dt>
        <dd>{{ manifest.author }}</dd>
        <dt>Version</dt>
        <dd>{{ manifest.version }}</dd>
        <dt>Size</dt>
        <dd>
          from {{ manifest.sizing.min.w }}×{{ manifest.sizing.min.h }} to {{ manifest.sizing.max.w }}×{{ manifest.sizing.max.h }}
        </dd>
        <dt>File size</dt>
        <dd>
          Code {{ formatBytes(pending.inspection.sizes.code) }}, media {{ formatBytes(pending.inspection.sizes.assets) }},
          source {{ formatBytes(pending.inspection.sizes.source) }}
        </dd>
      </dl>
      <p class="packages__warning">This is third-party code</p>
      <h3 class="packages__subtitle">Permissions</h3>
      <ul class="packages__permissions">
        <li v-for="permission in manifest.permissions" :key="permission" class="packages__grant">
          {{ PERMISSIONS[permission] }}<template v-if="permission === 'network'">: {{ (manifest.network ?? []).join(', ') }}</template>
          <UiSelect
            v-if="modes[permission]"
            :aria-label="`${PERMISSIONS[permission]}: mode`"
            :model-value="modes[permission]"
            :options="MODE_OPTIONS"
            @update:model-value="modes[permission] = $event as GrantMode"
          />
          <span v-else-if="savedMode(heldGrants, permission)" class="packages__hint">
            {{ MODES[savedMode(heldGrants, permission)!] }} — change it in the widget list
          </span>
        </li>
        <li v-if="manifest.permissions.length === 0">No permissions</li>
      </ul>
      <p v-if="isUpdate && pending.inspection.newPermissions.length > 0" class="packages__warning">
        New permissions: {{ permissionList(pending.inspection.newPermissions) }}
      </p>
      <p v-if="isUpdate && pending.inspection.newOrigins.length > 0" class="packages__warning">
        New origins: {{ pending.inspection.newOrigins.join(', ') }}
      </p>
      <template v-if="secretBindings.length > 0">
        <h3 class="packages__subtitle">Secrets</h3>
        <ul class="packages__permissions">
          <li
            v-for="secret in secretBindings"
            :key="secret.key"
            :class="{ packages__warning: isUpdate && pending.inspection.newSecretBindings.some((binding) => binding.key === secret.key) }"
          >
            {{ bindingLine(secret) }}
          </li>
        </ul>
        <p>The server may echo the key in its response; LifeDashboard replaces exact and URL-encoded copies with [REDACTED] but cannot hide altered copies</p>
      </template>
      <p v-if="pending.inspection.installed">This version is already installed and cannot be replaced. Bump version in widget.json, rebuild the widget and import the new folder. Then pick the new version in the settings of the placed widget.</p>
      <progress v-if="progress" class="packages__progress" :value="progress.sent" :max="progress.total" />
      <div class="packages__actions">
        <button type="button" class="packages__button" :disabled="busy || pending.inspection.installed" @click="install">
          {{ failedPath ? 'Retry' : 'Install' }}
        </button>
        <button type="button" class="packages__button" @click="cancel">Cancel</button>
      </div>
    </template>
    <template v-else>
      <h2 id="packages-title" class="packages__title">Widgets</h2>
      <p v-if="installedPackages.length === 0">No packages installed</p>
      <ul v-else class="packages__list">
        <li v-for="pkg in installedPackages" :key="pkg.id" class="packages__item">
          <span class="packages__name">{{ pkg.title }}</span>
          <span>{{ pkg.author }}</span>
          <span>{{ pkg.versions.map((item) => item.version).join(', ') }}</span>
          <span class="packages__grants">
            <template v-if="pkg.grants.length === 0">No permissions</template>
            <span v-for="grant in pkg.grants" :key="grant.permission" class="packages__grant">
              {{ PERMISSIONS[grant.permission] }}<template v-if="grant.permission === 'network'">: {{ pkg.origins.join(', ') }}</template>
              <UiSelect
                v-if="CONFIRMABLE_PERMISSIONS.has(grant.permission)"
                :id="modeId(pkg.id, grant)"
                :aria-label="`${PERMISSIONS[grant.permission]}: mode`"
                :model-value="grant.mode"
                :options="MODE_OPTIONS"
                :disabled="busy"
                @update:model-value="changeMode(pkg.id, grant, $event)"
              />
            </span>
          </span>
          <button type="button" class="packages__button" :disabled="busy" @click="remove(pkg.id)">Delete</button>
          <ul class="packages__sources">
            <li v-for="version in pkg.versions" :key="version.version">
              {{ version.version }} · Source:
              <template v-if="version.paths.source">
                <code class="packages__path">{{ version.paths.source }}</code>
                <button type="button" class="packages__button" @click="copy(version.paths.source)">Copy</button>
              </template>
              <template v-else>Source not included</template>
              <template v-if="version.paths.assets">
                · Media: <code class="packages__path">{{ version.paths.assets }}</code>
                <button type="button" class="packages__button" @click="copy(version.paths.assets)">Copy</button>
              </template>
            </li>
          </ul>
          <p v-if="confirmDelete === pkg.id" class="packages__warning">
            Source and media in userwidgets/{{ pkg.id }}/ will be deleted too
            <button type="button" class="packages__button" :disabled="busy" @click="remove(pkg.id)">Delete</button>
            <button type="button" class="packages__button" @click="confirmDelete = null">Cancel</button>
          </p>
        </li>
      </ul>
      <h3 class="packages__subtitle">Create your own widget</h3>
      <p>1. Create a project:</p>
      <p>
        <code class="packages__path">{{ CREATE_COMMAND }}</code>
        <button type="button" class="packages__button" @click="copy(CREATE_COMMAND)">Copy</button>
      </p>
      <p>2. Open the folder in Claude Code or Codex and write:</p>
      <p>
        <code class="packages__path">{{ AGENT_TASK }}</code>
        <button type="button" class="packages__button" @click="copy(AGENT_TASK)">Copy</button>
      </p>
      <div class="packages__actions">
        <button type="button" class="packages__button" :disabled="busy" @click="folderInput?.click()">Choose folder</button>
        <button type="button" class="packages__button" @click="open = false">Close</button>
      </div>
      <input ref="folderBox" type="file" webkitdirectory hidden @change="chooseFolder" />
    </template>
    <p class="packages__message" role="status">{{ message }}</p>
  </dialog>
</template>

<style scoped>
.packages {
  width: 36rem;
  max-width: calc(100vw - 2rem);
  padding: 1.5rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-card);
  background: var(--ld-surface-1-solid);
  color: var(--ld-text-primary);
  font-family: var(--ld-font-ui);
}

.packages::backdrop {
  background: var(--ld-scrim);
}

.packages__title {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}

.packages__subtitle {
  margin: 1rem 0 0.5rem;
  font-size: 1rem;
}

.packages__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
}

.packages__facts dt {
  color: var(--ld-text-muted);
}

.packages__facts dd {
  margin: 0;
}

.packages__warning {
  color: var(--ld-warning-text);
}

.packages__permissions,
.packages__list {
  margin: 0;
  padding: 0 0 0 1.25rem;
}

.packages__list {
  padding: 0;
  list-style: none;
}

.packages__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: var(--ld-border-width) solid var(--ld-border-subtle);
}

.packages__name {
  overflow-wrap: anywhere;
  font-weight: var(--ld-weight-strong);
}

.packages__grants {
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.25rem;
}

.packages__grant {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.packages__grant :deep(.ui-select-field) {
  flex: none;
  width: 11rem;
}

.packages__hint {
  color: var(--ld-text-muted);
  font-size: 0.875rem;
}

.packages__actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.packages__button {
  height: var(--ld-control-height);
  padding: 0 0.875rem;
  border: var(--ld-border-width) solid var(--ld-border-default);
  border-radius: var(--ld-radius-control);
  background: var(--ld-surface-3);
  color: var(--ld-text-primary);
  font: inherit;
  cursor: pointer;
}

.packages__button:focus-visible {
  outline: 0.125rem solid var(--ld-focus-ring);
  outline-offset: 0.125rem;
}

.packages__button:disabled {
  cursor: default;
  opacity: 0.5;
}

.packages__item > .packages__warning {
  grid-column: 1 / -1;
  margin: 0;
}

.packages__progress {
  width: 100%;
}

.packages__sources {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  color: var(--ld-text-muted);
}

.packages__path {
  overflow-wrap: anywhere;
  font-family: monospace;
}

.packages__message {
  min-height: 1.25rem;
  margin: 1rem 0 0;
  color: var(--ld-text-muted);
  font-size: 0.875rem;
}
</style>
