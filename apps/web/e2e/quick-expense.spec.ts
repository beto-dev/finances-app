import { test, expect } from '@playwright/test'
import { loginViaApi, TEST_USER } from './fixtures'

test.describe('Quick expense — /nuevo-gasto', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_USER.email, 'TEST_USER_EMAIL not set')
    await loginViaApi(page)
    await page.goto('/nuevo-gasto')
  })

  test('page renders the expense form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Nuevo Gasto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar Gasto' })).toBeVisible()
  })

  test('submit button is disabled when form is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Registrar Gasto' })).toBeDisabled()
  })

  test('registers a manual charge and shows success overlay', async ({ page }) => {
    await page.getByPlaceholder('0').fill('5000')
    await page.getByPlaceholder('¿En qué gastaste?').fill('Test Playwright charge')
    await page.getByRole('button', { name: 'Registrar Gasto' }).click()

    await expect(page.getByText('¡Gasto registrado!')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('¡Gasto registrado!')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByPlaceholder('0')).toHaveValue('')
    await expect(page.getByPlaceholder('¿En qué gastaste?')).toHaveValue('')
  })

  test('registered charge appears in /gastos', async ({ page }) => {
    const description = `PW-${Date.now()}`

    // Register the charge
    await page.getByPlaceholder('0').fill('3500')
    await page.getByPlaceholder('¿En qué gastaste?').fill(description)
    await page.getByRole('button', { name: 'Registrar Gasto' }).click()
    await expect(page.getByText('¡Gasto registrado!')).toBeVisible({ timeout: 5000 })

    // Navigate to /gastos and verify it appears
    await page.goto('/gastos')
    await expect(page.getByRole('cell', { name: description })).toBeVisible({ timeout: 5000 })
  })
})
