import { chromium } from '@playwright/test'
import { TEST_USER } from './fixtures'

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:8000'
const BASE_URL = 'http://localhost:5173'

export default async function globalSetup() {
  if (!TEST_USER.email || !TEST_USER.password) return

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  })
  const body = await response.json() as { access_token?: string }
  if (!body.access_token) {
    await browser.close()
    throw new Error(`Login failed: ${JSON.stringify(body)}`)
  }

  const payload = JSON.parse(
    Buffer.from(body.access_token.split('.')[1], 'base64').toString()
  ) as { sub: string }

  await page.goto(BASE_URL)
  await page.evaluate(
    ({ token, email, id }: { token: string; email: string; id: string }) => {
      localStorage.setItem('ff_token', token)
      localStorage.setItem('ff_email', email)
      localStorage.setItem('ff_id', id)
    },
    { token: body.access_token, email: TEST_USER.email, id: payload.sub }
  )

  await context.storageState({ path: 'e2e/.auth.json' })
  await browser.close()
}
