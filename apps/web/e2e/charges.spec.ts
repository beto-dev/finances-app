/**
 * E2E tests for the /gastos (charges) page — share, unshare, filter.
 *
 * These tests create charges via the quick-expense form first, then exercise
 * the /gastos page with desktop viewport (≥ 768 px) so the checkbox table is
 * visible instead of the mobile card list.
 */
import { test, expect } from '@playwright/test'
import { loginViaApi, TEST_USER } from './fixtures'

// Desktop viewport — enables checkbox table and bulk-action buttons
const DESKTOP = { width: 1280, height: 800 }

// Unique prefix to avoid collisions between test runs
const uid = () => `PW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createCharge(page: import('@playwright/test').Page, description: string, amount = '2500') {
  await page.goto('/nuevo-gasto')
  await page.getByPlaceholder('0').fill(amount)
  await page.getByPlaceholder('¿En qué gastaste?').fill(description)
  await page.getByRole('button', { name: 'Registrar Gasto' }).click()
  await expect(page.getByText('¡Gasto registrado!')).toBeVisible({ timeout: 5000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Charges page — /gastos', () => {
  test.use({ viewport: DESKTOP })

  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_USER.email, 'TEST_USER_EMAIL not set')
    await loginViaApi(page)
  })

  // ── Page renders ──────────────────────────────────────────────────────────
  test('page renders heading and filter controls', async ({ page }) => {
    await page.goto('/gastos')
    await expect(page.getByRole('heading', { name: 'Gastos' })).toBeVisible()
    await expect(page.getByPlaceholder('UBER, JUMBO, Netflix...')).toBeVisible()
    // Status filter dropdown exists
    await expect(page.getByRole('option', { name: 'Todos' })).toBeAttached()
  })

  // ── Search filter ─────────────────────────────────────────────────────────
  test('search filter narrows visible charges', async ({ page }) => {
    const desc = uid()
    await createCharge(page, desc)

    await page.goto('/gastos')
    // Charge appears before filtering
    await expect(page.getByRole('cell', { name: desc })).toBeVisible({ timeout: 5000 })

    // Filter to something that won't match
    await page.getByPlaceholder('UBER, JUMBO, Netflix...').fill('zzzno-match-zzzz')
    await expect(page.getByRole('cell', { name: desc })).not.toBeVisible()

    // Filter to the actual description
    await page.getByPlaceholder('UBER, JUMBO, Netflix...').fill(desc)
    await expect(page.getByRole('cell', { name: desc })).toBeVisible()
  })

  // ── Share with family ─────────────────────────────────────────────────────
  test('selecting a charge and clicking "Compartir" shares it with family', async ({ page }) => {
    const desc = uid()
    await createCharge(page, desc)

    await page.goto('/gastos')
    // Wait for the new charge to appear in the table
    const row = page.getByRole('row').filter({ hasText: desc })
    await expect(row).toBeVisible({ timeout: 5000 })

    // Select the charge via its checkbox
    const checkbox = row.getByRole('checkbox')
    await checkbox.check()

    // Click the "Compartir 1" bulk-action button
    await page.getByRole('button', { name: /Compartir 1/ }).click()

    // Toast confirms the action
    await expect(page.getByText(/compartidos con la familia/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/compartidos con la familia/)).not.toBeVisible({ timeout: 4000 })
  })

  // ── Unshare ────────────────────────────────────────────────────────────────
  test('selecting a shared charge and clicking "Dejar de compartir" unshares it', async ({ page }) => {
    const desc = uid()
    await createCharge(page, desc)

    // First: share it
    await page.goto('/gastos')
    const row = page.getByRole('row').filter({ hasText: desc })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.getByRole('checkbox').check()
    await page.getByRole('button', { name: /Compartir 1/ }).click()
    await expect(page.getByText(/compartidos con la familia/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/compartidos con la familia/)).not.toBeVisible({ timeout: 4000 })

    // Then: unshare it
    const row2 = page.getByRole('row').filter({ hasText: desc })
    await row2.getByRole('checkbox').check()
    await page.getByRole('button', { name: /Dejar de compartir 1/ }).click()
    await expect(page.getByText(/dejaron de compartirse/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/dejaron de compartirse/)).not.toBeVisible({ timeout: 4000 })
  })

  // ── Status filter: "Solo míos" ────────────────────────────────────────────
  test('filter "Solo míos" shows only personal charges', async ({ page }) => {
    const personalDesc = uid()
    await createCharge(page, personalDesc)

    await page.goto('/gastos')
    await expect(page.getByRole('cell', { name: personalDesc })).toBeVisible({ timeout: 5000 })

    // Select "Solo míos" filter
    await page.selectOption('select:has(option[value="personal"])', 'personal')

    // The personal charge is still visible
    await expect(page.getByRole('cell', { name: personalDesc })).toBeVisible()
  })

  // ── Status filter: "Compartidos" ──────────────────────────────────────────
  test('filter "Compartidos" shows only shared charges', async ({ page }) => {
    const desc = uid()
    await createCharge(page, desc)

    // Share it first
    await page.goto('/gastos')
    const row = page.getByRole('row').filter({ hasText: desc })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.getByRole('checkbox').check()
    await page.getByRole('button', { name: /Compartir 1/ }).click()
    await expect(page.getByText(/compartidos con la familia/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/compartidos con la familia/)).not.toBeVisible({ timeout: 4000 })

    // Now filter to "Compartidos"
    await page.selectOption('select:has(option[value="shared"])', 'shared')
    await expect(page.getByRole('cell', { name: desc })).toBeVisible({ timeout: 3000 })
  })
})
