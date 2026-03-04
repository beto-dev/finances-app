import { test, expect } from '@playwright/test'
import { loginViaApi, TEST_USER } from './fixtures'

test.describe('Auth', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/resumen')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Iniciar sesión con Google')).toBeVisible()
  })

  test('authenticated user can reach dashboard', async ({ page }) => {
    test.skip(!TEST_USER.email, 'TEST_USER_EMAIL not set')
    await loginViaApi(page)
    await page.goto('/resumen')
    await expect(page).not.toHaveURL(/\/login/)
  })
})
