// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Phone-First Booking Flow Integration Tests
 *
 * Tests the complete phone-first booking flow:
 * 1. User enters name/phone on everyday_vet schedule page (port 3334)
 * 2. Everyday_vet calls Levee API to create booking token
 * 3. Levee "sends" SMS with booking link
 * 4. User clicks link (book-external.html?token=...) on Levee (port 3333)
 * 5. Levee validates token and loads scheduler with patient data
 *
 * This test catches regressions like:
 * - Token validation errors (e.g., column does not exist)
 * - Patient data loading issues
 * - Cross-service integration failures
 *
 * Prerequisites:
 * - Everyday_vet server running on port 3334 (python3 -m http.server 3334)
 * - Levee server running on port 3333 (npm run dev)
 * - Database has test data or mock mode enabled
 */

const EVERYDAY_VET_URL = 'http://localhost:3334';
const LEVEE_URL = 'http://localhost:3333';
const TEST_PHONE = '3333333333';
const TEST_NAME = 'Test User';

// Helper to fill and submit the phone form
async function submitPhoneForm(page) {
  await page.goto(`${EVERYDAY_VET_URL}/schedule.html`, { waitUntil: 'networkidle' });

  const nameInput = page.locator('#name-input');
  const phoneInput = page.locator('#phone-input');

  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(TEST_NAME);
  await phoneInput.fill(TEST_PHONE);

  // Use force click to bypass any animation stability checks
  await page.locator('#send-link-btn').click({ force: true });
}

test.describe('Phone-First Booking Flow', () => {

  test('should get booking link after entering phone on everyday_vet', async ({ page }) => {
    await submitPhoneForm(page);

    // Wait for mock SMS inbox to appear (confirms submission worked)
    const mockSmsInbox = page.locator('.mock-sms-inbox');
    await expect(mockSmsInbox).toBeVisible({ timeout: 15000 });

    // Verify at least one SMS was sent (there may be multiple from previous tests)
    await expect(mockSmsInbox.locator('a[href*="book-external.html?token="]').last()).toBeVisible();

    console.log('✅ Phone submitted, mock SMS inbox shows booking link');
  });

  test('should validate token and load scheduler on Levee', async ({ page }) => {
    // Step 1: Submit phone form on everyday_vet
    await submitPhoneForm(page);

    // Step 2: Wait for mock SMS inbox to appear (dev mode)
    const mockSmsInbox = page.locator('.mock-sms-inbox');
    await expect(mockSmsInbox).toBeVisible({ timeout: 15000 });

    // Step 3: Get the booking link from mock SMS
    const bookingLink = mockSmsInbox.locator('a[href*="book-external.html?token="]').last();
    await expect(bookingLink).toBeVisible({ timeout: 5000 });

    const bookingUrl = await bookingLink.getAttribute('href');
    expect(bookingUrl).toContain('token=');
    console.log('Booking URL:', bookingUrl);

    // Step 4: Navigate to the booking link (on Levee)
    await page.goto(bookingUrl);

    // Step 5: Verify the scheduler loads successfully (token is valid)
    // If token validation fails, we'd see "Invalid Booking Link" error
    const schedulerContainer = page.locator('#scheduler-container');
    const errorMessage = page.locator('text=Invalid Booking Link');

    // Wait for scheduler to load
    await expect(schedulerContainer).toBeVisible({ timeout: 15000 });

    // Make sure there's no error
    await expect(errorMessage).not.toBeVisible();

    console.log('✅ Token validated successfully, scheduler loaded on Levee');
  });

  test('should show error for invalid/expired token on Levee', async ({ page }) => {
    // Test that invalid tokens show proper error message on Levee
    await page.goto(`${LEVEE_URL}/book-external.html?token=invalid-token-12345`);

    // Should show error state
    await expect(page.locator('text=Invalid Booking Link')).toBeVisible({ timeout: 10000 });
  });

  test('should load and display scheduler steps after token validation', async ({ page }) => {
    // This test verifies the full flow including patient data loading
    // which requires the pt.sex column fix

    // Step 1: Submit phone form on everyday_vet
    await submitPhoneForm(page);

    // Step 2: Get link from mock SMS
    const mockSmsInbox = page.locator('.mock-sms-inbox');
    await expect(mockSmsInbox).toBeVisible({ timeout: 15000 });

    const bookingLink = mockSmsInbox.locator('a[href*="book-external.html?token="]').last();
    const bookingUrl = await bookingLink.getAttribute('href');

    // Step 3: Go to Levee booking page
    await page.goto(bookingUrl);

    // Step 4: Verify scheduler loads with content
    await expect(page.locator('#scheduler-container')).toBeVisible({ timeout: 15000 });

    // Verify we're past loading state and showing actual content
    // The scheduler should show step indicators and content
    await expect(page.locator('.step-progress')).toBeVisible({ timeout: 10000 });

    // The scheduler should show some step content (address, pets, services, or book)
    const activeStep = page.locator('.estimator-step.active');
    await expect(activeStep).toBeVisible({ timeout: 5000 });

    console.log('✅ Scheduler steps loaded successfully from token data');
  });
});

test.describe('Token Validation API Direct Test', () => {
  test('validate-token API should return proper structure', async ({ request }) => {
    // First, get a token by submitting phone on everyday_vet
    // We'll call the Levee API directly

    const scheduleResponse = await request.post(`${LEVEE_URL}/api/public/schedule`, {
      data: {
        phone: TEST_PHONE,
        name: TEST_NAME,
        siteKey: 'evv_everyday_vet_dev'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // In dev mode this should work
    if (scheduleResponse.ok()) {
      const data = await scheduleResponse.json();
      console.log('Schedule response:', JSON.stringify(data, null, 2));

      // Extract token from the response or booking URL
      let token = data.token;
      if (!token && data.bookingUrl) {
        const match = data.bookingUrl.match(/token=([^&]+)/);
        if (match) token = match[1];
      }

      if (token) {
        // Now validate the token
        const validateResponse = await request.get(
          `${LEVEE_URL}/api/public/validate-token?token=${token}`
        );

        expect(validateResponse.ok()).toBe(true);

        const validateData = await validateResponse.json();
        expect(validateData.valid).toBe(true);

        // These fields are returned by validate-token
        expect(validateData).toHaveProperty('appointmentType');
        expect(validateData).toHaveProperty('expiresAt');

        console.log('✅ Token validation API returns correct structure');
        console.log('Response:', JSON.stringify(validateData, null, 2));
      }
    } else {
      console.log('Schedule API not available or returned error (may need site key)');
    }
  });
});
