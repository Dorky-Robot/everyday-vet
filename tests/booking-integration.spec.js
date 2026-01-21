// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * End-to-end integration tests for the booking flow.
 *
 * This test suite covers the complete booking journey:
 * 1. everyday_vet: Add pets, select services, submit to Levee
 * 2. Levee: Fill client info, select time, confirm booking
 *
 * Prerequisites:
 * - everyday_vet server running on port 3333
 * - Levee server running on port 3000
 * - Levee has a valid public_sites entry for 'evv_everyday_vet_dev'
 */

const LEVEE_BASE_URL = 'http://localhost:3000';

test.describe('Booking Integration Flow', () => {
  test.describe('Step 1: Schedule Wizard to Levee Handoff', () => {
    test('should complete wizard and redirect to Levee booking page', async ({ page }) => {
      // Start on everyday_vet
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Loki');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Verify pet was added
      await expect(page.locator('.pet-tab').filter({ hasText: 'Loki' })).toBeVisible();

      // Continue to customer type
      await page.click('#household-continue-btn');

      // Select existing client
      await page.click('#btn-existing-customer');

      // Verify we're on services step
      await expect(page.locator('#step-details')).toHaveClass(/active/);
      await expect(page.getByText('Services for Loki')).toBeVisible();

      // Select some services - Vaccinations
      const vaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await vaccinesAccordion.locator('.category-header').click();
      await expect(vaccinesAccordion).toHaveClass(/expanded/);

      // Select Bordetella vaccine
      const bordetellaCheckbox = vaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Bordetella' });
      await bordetellaCheckbox.click();

      // Verify estimate is shown
      await expect(page.locator('#result-content')).toBeVisible();
      await expect(page.locator('#total-price')).toBeVisible();

      // Verify Continue button appears
      const continueBtn = page.locator('#continue-to-scheduling-btn');
      await expect(continueBtn).toBeVisible();
      await expect(continueBtn).toContainText('Continue to Scheduling');

      // Click continue - this should redirect to Levee via window.location.href
      await continueBtn.click();

      // Wait for navigation to Levee booking page (same tab)
      await page.waitForURL(/localhost:3000\/book-external/, { timeout: 15000 });

      const bookingPage = page;

      // Verify we're on the Levee booking page with correct data
      await expect(bookingPage.locator('#booking-form')).toBeVisible({ timeout: 10000 });
      await expect(bookingPage.locator('#pets-list')).toContainText('Loki');
    });

    test('should pass pet and services data to Levee', async ({ page }) => {
      await page.goto('/#schedule');

      // Add two pets
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Luna');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Max');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Continue to services
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select services for Max (currently active as last added)
      const vaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await vaccinesAccordion.locator('.category-header').click();
      await vaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Rabies' }).click();

      // Switch to Luna and select services
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Luna' }).click();
      const lunaVaccines = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await lunaVaccines.locator('.category-header').click();
      await lunaVaccines.locator('.service-checkbox').filter({ hasText: 'FVRCP' }).click();

      // Continue to Levee
      const continueBtn = page.locator('#continue-to-scheduling-btn');
      await expect(continueBtn).toBeVisible();
      await continueBtn.click();

      // Wait for navigation to Levee (same tab)
      await page.waitForURL(/localhost:3000\/book-external/, { timeout: 15000 });
      const bookingPage = page;

      // Verify both pets are shown
      await expect(bookingPage.locator('#booking-form')).toBeVisible({ timeout: 10000 });
      await expect(bookingPage.locator('#pets-list')).toContainText('Luna');
      await expect(bookingPage.locator('#pets-list')).toContainText('Max');

      // Verify services section shows selected services
      await expect(bookingPage.locator('#services-section')).toBeVisible();
    });
  });

  test.describe('Step 2: Levee Booking Form', () => {
    // Helper to get to Levee booking page with a pet
    async function setupBookingPage(page) {
      await page.goto('/#schedule');

      // Quick setup - add pet and service
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'TestPet');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select a service
      const vaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await vaccinesAccordion.locator('.category-header').click();
      await vaccinesAccordion.locator('.service-checkbox').first().click();

      // Navigate to Levee (same tab via window.location.href)
      await page.click('#continue-to-scheduling-btn');
      await page.waitForURL(/localhost:3000\/book-external/, { timeout: 15000 });
      await expect(page.locator('#booking-form')).toBeVisible({ timeout: 10000 });

      return page;
    }

    test('should show client form fields', async ({ page }) => {
      const bookingPage = await setupBookingPage(page);

      // Verify form fields are present
      await expect(bookingPage.locator('#client-name')).toBeVisible();
      await expect(bookingPage.locator('#client-phone')).toBeVisible();
      await expect(bookingPage.locator('#client-email')).toBeVisible();
      await expect(bookingPage.locator('#submit-btn')).toBeVisible();
    });

    test('should enable submit button when required fields are filled', async ({ page }) => {
      const bookingPage = await setupBookingPage(page);

      // Initially button should be disabled
      await expect(bookingPage.locator('#submit-btn')).toBeDisabled();

      // Fill required fields - name and phone (phone validates ownership via SMS)
      await bookingPage.fill('#client-name', 'Test User');
      await bookingPage.fill('#client-phone', '555-123-4567');

      // Button should be enabled
      await expect(bookingPage.locator('#submit-btn')).toBeEnabled();
    });

    test('should keep submit disabled without phone', async ({ page }) => {
      const bookingPage = await setupBookingPage(page);

      // Fill name but no phone
      await bookingPage.fill('#client-name', 'Test User');
      await bookingPage.fill('#client-email', 'test@example.com');

      // Button should remain disabled since phone is required
      await expect(bookingPage.locator('#submit-btn')).toBeDisabled();

      // Add phone number
      await bookingPage.fill('#client-phone', '555-123-4567');

      // Now button should be enabled
      await expect(bookingPage.locator('#submit-btn')).toBeEnabled();
    });

    test('should call booking-link API when form is submitted', async ({ page }) => {
      const bookingPage = await setupBookingPage(page);

      // Fill form
      await bookingPage.fill('#client-name', 'Integration Test User');
      await bookingPage.fill('#client-phone', '555-987-6543');
      await bookingPage.fill('#client-email', 'test@example.com');

      // Listen for API call
      const apiPromise = bookingPage.waitForResponse(
        (response) => response.url().includes('/api/public/booking-link'),
        { timeout: 10000 }
      );

      // Submit form
      await bookingPage.click('#submit-btn');

      // Verify API was called
      const apiResponse = await apiPromise;
      expect(apiResponse.status()).toBeLessThan(500); // Not a server error
    });
  });

  test.describe('Full E2E Flow', () => {
    test('complete booking flow from start to confirmation', async ({ page }) => {
      // Use a unique phone number with timestamp to avoid conflicts
      const timestamp = Date.now();
      const testPhone = `555-${String(timestamp).slice(-7)}`;

      // ========================================
      // STEP 1: everyday_vet - Add pet and services
      // ========================================
      await page.goto('/#schedule');

      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'E2E-TestPet');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select Bordetella vaccine
      const vaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await vaccinesAccordion.locator('.category-header').click();
      await vaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Bordetella' }).click();

      // ========================================
      // STEP 2: Click "Continue to Scheduling" -> Levee book-external
      // ========================================
      await page.click('#continue-to-scheduling-btn');
      await page.waitForURL(/localhost:3000\/book-external/, { timeout: 15000 });
      await expect(page.locator('#booking-form')).toBeVisible({ timeout: 10000 });

      // ========================================
      // STEP 3: Fill client information on Levee
      // ========================================
      await page.fill('#client-name', 'E2E Test Client');
      await page.fill('#client-phone', testPhone);
      await page.fill('#client-email', 'e2e-test@example.com');

      // ========================================
      // STEP 4: Submit -> Redirect to book.html with token
      // ========================================
      const bookingLinkPromise = page.waitForResponse(
        (response) => response.url().includes('/api/public/booking-link'),
        { timeout: 10000 }
      );

      await page.click('#submit-btn');

      const bookingLinkResponse = await bookingLinkPromise;
      expect(bookingLinkResponse.ok()).toBe(true);

      // Wait for redirect to book.html with token (could be localhost or ngrok)
      await page.waitForURL(/book\.html\?token=/, { timeout: 15000 });

      // ========================================
      // STEP 5: Select a date from calendar
      // ========================================
      // Wait for calendar to load
      await expect(page.locator('#bookingContainer')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#calendar')).toBeVisible();

      // Try to find a date with available time slots
      // Some days might be fully booked or closed, so we try multiple days
      const availableDays = page.locator('#calendar .calendar-day:not(.other-month):not(.disabled):not(.closed)');
      const dayCount = await availableDays.count();

      let foundSlots = false;
      for (let i = 0; i < Math.min(dayCount, 7); i++) {
        const day = availableDays.nth(i);
        await day.click();

        // Wait for time slots to load
        await page.waitForTimeout(1000);

        // Check if there are available time slots
        const slots = page.locator('#timeGrid .time-slot');
        const slotCount = await slots.count();

        if (slotCount > 0) {
          foundSlots = true;
          console.log(`Found ${slotCount} time slots on day ${i + 1}`);
          break;
        }
        console.log(`Day ${i + 1}: no slots available, trying next day...`);
      }

      expect(foundSlots).toBe(true);

      // ========================================
      // STEP 6: Select a time slot
      // ========================================
      const timeSlot = page.locator('#timeGrid .time-slot').first();
      await expect(timeSlot).toBeVisible({ timeout: 5000 });

      // Click first available time slot
      await timeSlot.click();

      // ========================================
      // STEP 6b: Select appointment type (if shown)
      // ========================================
      // The type section may or may not be visible depending on whether
      // the booking data pre-selected a type
      const typeSection = page.locator('#typeSection');
      if (await typeSection.isVisible()) {
        // Click first appointment type
        await page.locator('#typeGrid .type-btn').first().click();
      }

      // ========================================
      // STEP 7: Confirm the appointment
      // ========================================
      // Wait for confirm section to appear
      await expect(page.locator('#confirmSection')).toBeVisible({ timeout: 10000 });

      // Listen for the confirm API call
      const confirmPromise = page.waitForResponse(
        (response) => response.url().includes('/api/book/confirm'),
        { timeout: 15000 }
      );

      // Click confirm button
      await page.click('#confirmBtn');

      // Wait for API response
      const confirmResponse = await confirmPromise;
      console.log('Confirm API response:', confirmResponse.status());

      // ========================================
      // STEP 8: Verify Levee success screen
      // ========================================
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#successScreen h2')).toContainText('Appointment Confirmed');

      // Verify calendar links are present
      await expect(page.locator('#googleCalendarLink')).toBeVisible();
      await expect(page.locator('#icsDownloadLink')).toBeVisible();

      console.log('✅ Levee booking confirmed, calendar links shown');

      // ========================================
      // STEP 9: Return to everyday.vet
      // ========================================
      // The "Return to Website" button appears when returnUrl is set
      // Click it to return immediately (instead of waiting 5s for auto-redirect)
      const returnButton = page.locator('.return-link');
      await expect(returnButton).toBeVisible({ timeout: 5000 });
      await returnButton.click();

      // ========================================
      // STEP 10: Verify everyday.vet success screen
      // ========================================
      // Should redirect back to everyday.vet with ?booking=success
      // (127.0.0.1 or localhost depending on playwright config)
      // Note: After loading, scheduler.js replaces URL with #services for cleaner look
      await page.waitForURL(/(:3333|everyday).*booking=success/, { timeout: 10000 });

      // Verify the success screen is shown on everyday.vet
      await expect(page.locator('.booking-success-screen')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.booking-success-screen h2')).toContainText("You're All Set!");
      await expect(page.locator('.booking-success-screen')).toContainText('has been scheduled');

      // Verify action buttons are present
      await expect(page.locator('.booking-success-screen .btn-primary')).toBeVisible();
      await expect(page.locator('.booking-success-screen .btn-secondary')).toBeVisible();

      console.log('✅ Full round-trip E2E booking flow completed successfully!');
      console.log('   everyday.vet → Levee book-external → Levee book.html → everyday.vet success');
    });
  });
});
