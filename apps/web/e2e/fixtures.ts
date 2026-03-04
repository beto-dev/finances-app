import { type Page } from '@playwright/test'
import * as fs from 'fs'

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:8000'

export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL ?? '',
  password: process.env.TEST_USER_PASSWORD ?? '',
}

/**
 * Restore the saved auth session (set by global-setup) into localStorage.
 * Call this instead of hitting the login API directly — avoids rate limits.
 */
export async function loginViaApi(page: Page): Promise<void> {
  const authFile = 'e2e/.auth.json'
  if (!fs.existsSync(authFile)) {
    throw new Error('Auth session not found. Run with TEST_USER_EMAIL set so global-setup can login first.')
  }

  const state = JSON.parse(fs.readFileSync(authFile, 'utf-8')) as {
    origins: { origin: string; localStorage: { name: string; value: string }[] }[]
  }

  const origin = state.origins.find((o) => o.origin.includes('localhost:5173'))
  const entries = origin?.localStorage ?? []

  await page.goto('/')
  await page.evaluate((items: { name: string; value: string }[]) => {
    for (const { name, value } of items) {
      localStorage.setItem(name, value)
    }
  }, entries)
}

export { API_URL }
