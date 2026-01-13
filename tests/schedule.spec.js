// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Schedule Form', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('Initial State', () => {
    test('should show new/existing client choice on first visit', async ({ page }) => {
      await page.goto('/#schedule');

      await expect(page.locator('#btn-new-customer')).toBeVisible();
      await expect(page.locator('#btn-existing-customer')).toBeVisible();
      await expect(page.getByText('Are you a new or existing client?')).toBeVisible();
    });

    test('should have first step dot active initially', async ({ page }) => {
      await page.goto('/#schedule');

      const firstDot = page.locator('.step-dot').first();
      await expect(firstDot).toHaveClass(/active/);
    });
  });

  test.describe('New Customer Flow', () => {
    test('should show new client consultation when clicking New Client', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-new-customer');

      await expect(page.locator('#new-customer-content')).toBeVisible();
      await expect(page.getByText('New Client Consultation')).toBeVisible();
      await expect(page.locator('.onboarding-duration')).toContainText('30 minutes');
    });

    test('should persist new customer flow after refresh', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-new-customer');
      await expect(page.getByText('New Client Consultation')).toBeVisible();

      // Refresh the page
      await page.reload();
      await page.goto('/#schedule');

      // Should still show new client consultation
      await expect(page.locator('#new-customer-content')).toBeVisible();
      await expect(page.getByText('New Client Consultation')).toBeVisible();
    });
  });

  test.describe('Existing Customer Flow', () => {
    test('should show pet management when clicking Existing Client', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');

      await expect(page.locator('#existing-customer-content')).toBeVisible();
      await expect(page.getByText('Who are we seeing today?')).toBeVisible();
      await expect(page.locator('#add-pet-btn')).toBeVisible();
    });

    test('should open add pet modal when clicking Add Pet', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');

      await expect(page.locator('#add-pet-modal')).toBeVisible();
      await expect(page.locator('#pet-name-input')).toBeVisible();
    });

    test('should add a pet successfully', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');

      // Fill in pet details
      await page.fill('#pet-name-input', 'Luna');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Modal should close and pet tab should appear
      await expect(page.locator('#add-pet-modal')).not.toBeVisible();
      await expect(page.locator('.pet-tab').filter({ hasText: 'Luna' })).toBeVisible();
    });

    test('should show services section after adding a pet', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Max');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      await expect(page.locator('#pet-services-section')).toBeVisible();
      await expect(page.getByText('Services for Max')).toBeVisible();
    });

    test('should persist pet data after refresh', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Buddy');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      await expect(page.locator('.pet-tab').filter({ hasText: 'Buddy' })).toBeVisible();

      // Refresh the page
      await page.reload();
      await page.goto('/#schedule');

      // Pet should still be there
      await expect(page.locator('.pet-tab').filter({ hasText: 'Buddy' })).toBeVisible();
    });
  });

  test.describe('Pet Removal', () => {
    test('should remove a pet when clicking X', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Whiskers');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Verify pet exists
      const petTab = page.locator('.pet-tab').filter({ hasText: 'Whiskers' });
      await expect(petTab).toBeVisible();

      // Click remove button
      await petTab.locator('.remove-pet').click();

      // Pet should be removed
      await expect(petTab).not.toBeVisible();
    });

    test('should remove the only pet', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a single pet
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Solo');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      const petTab = page.locator('.pet-tab').filter({ hasText: 'Solo' });
      await expect(petTab).toBeVisible();

      // Remove the only pet
      await petTab.locator('.remove-pet').click();

      // Pet should be removed, services section should hide
      await expect(petTab).not.toBeVisible();
      await expect(page.locator('#pet-services-section')).not.toBeVisible();
    });
  });

  test.describe('Service Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet first
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'TestPet');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
    });

    test('should expand accordion when clicking header', async ({ page }) => {
      const accordion = page.locator('.category-accordion').first();
      const header = accordion.locator('.category-header');

      await header.click();

      await expect(accordion).toHaveClass(/expanded/);
    });

    test('should show estimate after selecting a service', async ({ page }) => {
      // Expand first accordion
      const accordion = page.locator('.category-accordion').first();
      await accordion.locator('.category-header').click();

      // Wait for accordion to expand and content to be visible
      await expect(accordion).toHaveClass(/expanded/);
      await expect(accordion.locator('.category-content')).toBeVisible();

      // Select a service by clicking the label (more reliable than the hidden checkbox)
      await accordion.locator('.service-checkbox').first().click();

      // Estimate should show
      await expect(page.locator('#result-content')).toBeVisible();
      await expect(page.locator('#total-price')).toBeVisible();
    });

    test('should persist selected services after refresh', async ({ page }) => {
      // Expand first accordion
      const accordion = page.locator('.category-accordion').first();
      await accordion.locator('.category-header').click();
      await expect(accordion).toHaveClass(/expanded/);

      // Select a service by clicking the label
      const firstService = accordion.locator('.service-checkbox').first();
      await firstService.click();

      // Verify it's checked
      const checkbox = firstService.locator('input');
      await expect(checkbox).toBeChecked();

      // Refresh
      await page.reload();
      await page.goto('/#schedule');

      // Service should still be selected (check via chiclet or checkbox)
      await expect(accordion.locator('.selected-chiclets .service-chiclet')).toBeVisible();
    });
  });

  test.describe('Step Navigation', () => {
    test('should navigate back to step 0 when clicking first dot', async ({ page }) => {
      await page.goto('/#schedule');

      // Go to step 1
      await page.click('#btn-existing-customer');
      await expect(page.locator('#existing-customer-content')).toBeVisible();

      // Click first dot to go back
      await page.locator('.step-dot').first().click();

      // Should show step 0
      await expect(page.getByText('Are you a new or existing client?')).toBeVisible();
    });

    test('should reset form when navigating back to step 0', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'ResetTest');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      await expect(page.locator('.pet-tab').filter({ hasText: 'ResetTest' })).toBeVisible();

      // Go back to step 0
      await page.locator('.step-dot').first().click();

      // Pet data should be cleared
      await page.click('#btn-existing-customer');
      await expect(page.locator('.pet-tab').filter({ hasText: 'ResetTest' })).not.toBeVisible();
    });

    test('should reset form when switching from existing to new customer', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet as existing customer
      await page.click('#btn-existing-customer');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'SwitchTest');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Go back and choose new customer
      await page.locator('.step-dot').first().click();
      await page.click('#btn-new-customer');

      // Refresh
      await page.reload();
      await page.goto('/#schedule');

      // Should show new customer content, not existing pet
      await expect(page.locator('#new-customer-content')).toBeVisible();
    });
  });

  test.describe('Multiple Pets', () => {
    test('should handle multiple pets', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');

      // Add first pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Luna');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Add second pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Max');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Both pets should be visible
      await expect(page.locator('.pet-tab').filter({ hasText: 'Luna' })).toBeVisible();
      await expect(page.locator('.pet-tab').filter({ hasText: 'Max' })).toBeVisible();
    });

    test('should switch between pets', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#btn-existing-customer');

      // Add two pets
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Cat1');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Dog1');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Second pet should be active (just added)
      await expect(page.getByText('Services for Dog1')).toBeVisible();

      // Click on first pet
      await page.locator('.pet-tab').filter({ hasText: 'Cat1' }).click();

      // First pet should now be active
      await expect(page.getByText('Services for Cat1')).toBeVisible();
    });
  });
});
