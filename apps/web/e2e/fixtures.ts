import { type Page } from '@playwright/test'

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:8000'

export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL ?? '',
  password: process.env.TEST_USER_PASSWORD ?? '',
}

/**
 * Authenticate via email/password API and inject the JWT token into
 * localStorage so the app treats the browser session as logged in.
 */
export async function loginViaApi(page: Page): Promise<void> {
  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  })
  const body = await response.json() as { access_token: string }
  await page.goto('/')
  await page.evaluate((token: string) => {
    localStorage.setItem('ff_token', token)
  }, body.access_token)
}
