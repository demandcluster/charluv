import { Component, For, Show, createSignal, onMount } from 'solid-js'
import { adminStore } from '/web/store'
import PageHeader from '/web/shared/PageHeader'
import Button from '/web/shared/Button'
import TextInput from '/web/shared/TextInput'
import { Toggle } from '/web/shared/Toggle'
import { setComponentPageTitle, toLocalTime } from '/web/shared/util'
import { Card } from '/web/shared/Card'
import { Page } from '/web/Layout'
import { AppSchema } from '/common/types'

export { PromoCodesPage as default }

function genCode(len = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

const PromoCodesPage: Component = () => {
  setComponentPageTitle('Promo Codes')

  const state = adminStore()

  onMount(() => {
    adminStore.getPromos()
  })

  // ── Create form state ─────────────────────────────────────────────────────
  const [createCode, setCreateCode] = createSignal('')
  const [createCredits, setCreateCredits] = createSignal(0)
  const [createDays, setCreateDays] = createSignal(0)
  const [createMaxUses, setCreateMaxUses] = createSignal(0)
  const [createEnabled, setCreateEnabled] = createSignal(true)
  const [createExpiresAt, setCreateExpiresAt] = createSignal('')

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editing, setEditing] = createSignal<AppSchema.PromoCode | null>(null)
  const [editCode, setEditCode] = createSignal('')
  const [editCredits, setEditCredits] = createSignal(0)
  const [editDays, setEditDays] = createSignal(0)
  const [editMaxUses, setEditMaxUses] = createSignal(0)
  const [editEnabled, setEditEnabled] = createSignal(true)
  const [editExpiresAt, setEditExpiresAt] = createSignal('')

  // ── Delete confirm state ──────────────────────────────────────────────────
  const [deleting, setDeleting] = createSignal<AppSchema.PromoCode | null>(null)

  const startEdit = (promo: AppSchema.PromoCode) => {
    setEditing(promo)
    setEditCode(promo.code)
    setEditCredits(promo.credits ?? 0)
    setEditDays(promo.days ?? 0)
    setEditMaxUses(promo.maxUses)
    setEditEnabled(promo.enabled)
    setEditExpiresAt(promo.expiresAt ? toLocalTime(promo.expiresAt) : '')
  }

  const cancelEdit = () => setEditing(null)

  const submitCreate = () => {
    const code = createCode().trim()
    if (!code) return
    const expiresAt = createExpiresAt()
    adminStore.createPromo(
      {
        code,
        credits: createCredits() || undefined,
        days: createDays() || undefined,
        maxUses: createMaxUses(),
        enabled: createEnabled(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      },
      () => {
        setCreateCode('')
        setCreateCredits(0)
        setCreateDays(0)
        setCreateMaxUses(0)
        setCreateEnabled(true)
        setCreateExpiresAt('')
      }
    )
  }

  const submitEdit = () => {
    const promo = editing()
    if (!promo) return
    const expiresAt = editExpiresAt()
    adminStore.updatePromo(
      promo._id,
      {
        code: editCode().trim(),
        credits: editCredits(),
        days: editDays(),
        maxUses: editMaxUses(),
        enabled: editEnabled(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
      },
      () => setEditing(null)
    )
  }

  const confirmDelete = () => {
    const promo = deleting()
    if (!promo) return
    adminStore.deletePromo(promo._id, () => setDeleting(null))
  }

  const formatExpiry = (iso?: string) => {
    if (!iso) return 'never'
    return new Date(iso).toLocaleString()
  }

  const formatUses = (uses: number, maxUses: number) => {
    return `${uses} / ${maxUses === 0 ? '∞' : maxUses}`
  }

  return (
    <Page>
      <PageHeader title="Promo Codes" />

      {/* ── Create form ─────────────────────────────────────────────────── */}
      <Card class="mb-4">
        <div class="mb-2 text-lg font-bold">Create Promo Code</div>
        <div class="flex flex-col gap-2">
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <TextInput
                fieldName="createCode"
                label="Code"
                placeholder="WELCOME10"
                value={createCode()}
                onInput={(ev) => setCreateCode(ev.currentTarget.value.toUpperCase())}
              />
            </div>
            <Button schema="secondary" class="mb-[2px]" onClick={() => setCreateCode(genCode())}>
              Generate
            </Button>
          </div>

          <div class="flex gap-2">
            <div class="flex-1">
              <TextInput
                fieldName="createCredits"
                label="Credits"
                type="number"
                value={createCredits()}
                onInput={(ev) => setCreateCredits(Number(ev.currentTarget.value))}
              />
            </div>
            <div class="flex-1">
              <TextInput
                fieldName="createDays"
                label="Days Premium"
                type="number"
                value={createDays()}
                onInput={(ev) => setCreateDays(Number(ev.currentTarget.value))}
              />
            </div>
            <div class="flex-1">
              <TextInput
                fieldName="createMaxUses"
                label="Max Uses (0 = unlimited)"
                type="number"
                value={createMaxUses()}
                onInput={(ev) => setCreateMaxUses(Number(ev.currentTarget.value))}
              />
            </div>
          </div>

          <TextInput
            fieldName="createExpiresAt"
            label="Expires At (optional)"
            type="datetime-local"
            value={createExpiresAt()}
            onInput={(ev) => setCreateExpiresAt(ev.currentTarget.value)}
          />

          <Toggle
            fieldName="createEnabled"
            label="Enabled"
            value={createEnabled()}
            onChange={(val) => setCreateEnabled(val)}
          />

          <div class="flex justify-end">
            <Button onClick={submitCreate}>Create</Button>
          </div>
        </div>
      </Card>

      {/* ── Promo list ──────────────────────────────────────────────────── */}
      <div class="flex flex-col gap-2">
        <For each={state.promos}>
          {(promo) => (
            <div class="flex flex-col gap-1 rounded-lg bg-[var(--bg-800)] p-3">
              {/* ── View row ──────────────────────────────────────────── */}
              <Show when={editing()?._id !== promo._id}>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-col gap-0.5">
                    <span class="font-mono text-sm font-bold">{promo.code}</span>
                    <span class="text-xs text-[var(--text-500)]">
                      {promo.credits ? `${promo.credits} credits` : ''}
                      {promo.credits && promo.days ? ' · ' : ''}
                      {promo.days ? `${promo.days} days` : ''}
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-4 text-xs text-[var(--text-500)]">
                    <span>Uses: {formatUses(promo.uses, promo.maxUses)}</span>
                    <span>
                      Status:{' '}
                      <span
                        classList={{
                          'text-green-400': promo.enabled,
                          'text-red-400': !promo.enabled,
                        }}
                      >
                        {promo.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </span>
                    <span>Expires: {formatExpiry(promo.expiresAt)}</span>
                  </div>
                  <div class="flex gap-2">
                    <Button schema="secondary" size="sm" onClick={() => startEdit(promo)}>
                      Edit
                    </Button>
                    <Button schema="red" size="sm" onClick={() => setDeleting(promo)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Show>

              {/* ── Inline edit form ──────────────────────────────────── */}
              <Show when={editing()?._id === promo._id}>
                <div class="flex flex-col gap-2">
                  <div class="flex items-end gap-2">
                    <div class="flex-1">
                      <TextInput
                        fieldName="editCode"
                        label="Code"
                        value={editCode()}
                        onInput={(ev) => setEditCode(ev.currentTarget.value.toUpperCase())}
                      />
                    </div>
                    <Button
                      schema="secondary"
                      class="mb-[2px]"
                      onClick={() => setEditCode(genCode())}
                    >
                      Generate
                    </Button>
                  </div>

                  <div class="flex gap-2">
                    <div class="flex-1">
                      <TextInput
                        fieldName="editCredits"
                        label="Credits"
                        type="number"
                        value={editCredits()}
                        onInput={(ev) => setEditCredits(Number(ev.currentTarget.value))}
                      />
                    </div>
                    <div class="flex-1">
                      <TextInput
                        fieldName="editDays"
                        label="Days Premium"
                        type="number"
                        value={editDays()}
                        onInput={(ev) => setEditDays(Number(ev.currentTarget.value))}
                      />
                    </div>
                    <div class="flex-1">
                      <TextInput
                        fieldName="editMaxUses"
                        label="Max Uses (0 = unlimited)"
                        type="number"
                        value={editMaxUses()}
                        onInput={(ev) => setEditMaxUses(Number(ev.currentTarget.value))}
                      />
                    </div>
                  </div>

                  <TextInput
                    fieldName="editExpiresAt"
                    label="Expires At (optional)"
                    type="datetime-local"
                    value={editExpiresAt()}
                    onInput={(ev) => setEditExpiresAt(ev.currentTarget.value)}
                  />

                  <Toggle
                    fieldName="editEnabled"
                    label="Enabled"
                    value={editEnabled()}
                    onChange={(val) => setEditEnabled(val)}
                  />

                  <div class="flex justify-end gap-2">
                    <Button schema="secondary" onClick={cancelEdit}>
                      Cancel
                    </Button>
                    <Button onClick={submitEdit}>Save</Button>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* ── Delete confirm modal ─────────────────────────────────────────── */}
      <Show when={!!deleting()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div class="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-lg bg-[var(--bg-800)] p-6">
            <div class="text-lg font-bold">Delete Promo Code</div>
            <div>
              Are you sure you want to delete{' '}
              <span class="font-mono font-bold">{deleting()?.code}</span>? This cannot be undone.
            </div>
            <div class="flex justify-end gap-2">
              <Button schema="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button schema="red" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </Page>
  )
}
