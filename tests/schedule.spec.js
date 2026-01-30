// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests for the scheduling wizard.
 *
 * Entry point is phone-first flow (enter phone → receive SMS booking link).
 * After the booking link, the wizard steps are:
 * - Step 0: Household (add pets)
 * - Step 1: Customer type (new/existing client)
 * - Step 2: Services selection
 */
test.describe('Schedule Form', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to clean URL (no state params) before each test
    await page.goto('/');
  });

  test.describe('Initial State (Household Step)', () => {
    test('should show household step on first visit', async ({ page }) => {
      await page.goto('/#schedule');

      // Wait for wizard to initialize
      await page.waitForSelector('.estimator-step.active', { timeout: 5000 });

      // Step 0 is household step
      await expect(page.locator('#step-household')).toHaveClass(/active/);
      await expect(page.getByText('Tell us about your household')).toBeVisible();
      await expect(page.locator('#add-pet-btn')).toBeVisible();
    });

    test('should show disabled continue button initially', async ({ page }) => {
      await page.goto('/#schedule');

      const continueBtn = page.locator('#household-continue-btn');
      await expect(continueBtn).toBeVisible();
      await expect(continueBtn).toBeDisabled();
    });
  });

  test.describe('Adding Pets', () => {
    test('should open add pet modal when clicking Add Pet', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#add-pet-btn');

      await expect(page.locator('#add-pet-modal')).toBeVisible();
      await expect(page.locator('#pet-name-input')).toBeVisible();
    });

    test('should add a pet successfully', async ({ page }) => {
      await page.goto('/#schedule');

      await page.click('#add-pet-btn');

      // Fill in pet details
      await page.fill('#pet-name-input', 'Luna');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Modal should close and pet tab should appear
      await expect(page.locator('#add-pet-modal')).not.toBeVisible();
      await expect(page.locator('.pet-tab').filter({ hasText: 'Luna' })).toBeVisible();
    });

    test('should enable continue button after adding a pet', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Max');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Continue button should be enabled
      const continueBtn = page.locator('#household-continue-btn');
      await expect(continueBtn).toBeEnabled();
    });

    test('should persist pet data after refresh', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Buddy');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      await expect(page.locator('.pet-tab').filter({ hasText: 'Buddy' })).toBeVisible();

      // Refresh the page (URL state params are preserved)
      await page.reload();

      // Pet should still be there
      await expect(page.locator('.pet-tab').filter({ hasText: 'Buddy' })).toBeVisible();
    });
  });

  test.describe('Customer Type Selection', () => {
    test.beforeEach(async ({ page }) => {
      // Add a pet first to proceed to customer type step
      await page.goto('/#schedule');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'TestPet');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
      await page.click('#household-continue-btn');
    });

    test('should show customer type options after continuing from household', async ({ page }) => {
      await expect(page.locator('#step-customer-type')).toHaveClass(/active/);
      await expect(page.locator('#btn-new-customer')).toBeVisible();
      await expect(page.locator('#btn-existing-customer')).toBeVisible();
    });

    test('should show new client consultation when clicking New Client', async ({ page }) => {
      await page.click('#btn-new-customer');

      await expect(page.locator('#new-customer-content')).toBeVisible();
      await expect(page.getByText('New Client Consultation')).toBeVisible();
    });

    test('should show services when clicking Existing Client', async ({ page }) => {
      await page.click('#btn-existing-customer');

      await expect(page.locator('#step-details')).toHaveClass(/active/);
      await expect(page.locator('#pet-services-section')).toBeVisible();
      await expect(page.getByText('Services for TestPet')).toBeVisible();
    });

    test('should persist customer type after refresh', async ({ page }) => {
      await page.click('#btn-new-customer');
      await expect(page.getByText('New Client Consultation')).toBeVisible();

      // Refresh the page
      await page.reload();

      // Should still show new client consultation
      await expect(page.locator('#new-customer-content')).toBeVisible();
    });
  });

  test.describe('Pet Removal', () => {
    test('should remove a pet when clicking X', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet
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

    test('should disable continue button after removing the only pet', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a single pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Solo');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      const petTab = page.locator('.pet-tab').filter({ hasText: 'Solo' });
      await expect(petTab).toBeVisible();

      // Verify continue is enabled
      await expect(page.locator('#household-continue-btn')).toBeEnabled();

      // Remove the only pet
      await petTab.locator('.remove-pet').click();

      // Continue should be disabled again
      await expect(page.locator('#household-continue-btn')).toBeDisabled();
    });
  });

  test.describe('Service Selection', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to services step
      await page.goto('/#schedule');
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'TestPet');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');
    });

    test('should expand accordion when clicking header', async ({ page }) => {
      const accordion = page.locator('.category-accordion').first();
      const header = accordion.locator('.category-header');

      await header.click();

      await expect(accordion).toHaveClass(/expanded/);
    });

    test('should show estimate after selecting a service', async ({ page }) => {
      // Expand Vaccinations accordion (has checkboxes)
      const accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await accordion.locator('.category-header').click();

      // Wait for accordion to expand and content to be visible
      await expect(accordion).toHaveClass(/expanded/);
      await expect(accordion.locator('.category-content')).toBeVisible();

      // Select a service by clicking the label
      await accordion.locator('.service-checkbox').first().click();

      // Estimate should show
      await expect(page.locator('#result-content')).toBeVisible();
      await expect(page.locator('#total-price')).toBeVisible();
    });

    test('should persist selected services after refresh', async ({ page }) => {
      // Expand vaccinations accordion
      const accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await accordion.locator('.category-header').click();
      await expect(accordion).toHaveClass(/expanded/);

      // Select a service
      const firstService = accordion.locator('.service-checkbox').first();
      await firstService.click();

      // Collapse accordion to see chiclet (chiclets hidden when expanded)
      await accordion.locator('.category-header').click();
      await expect(accordion).not.toHaveClass(/expanded/);

      // Verify it's selected (via chiclet) - use first() since vaccines also add a "Free Quick Exam" chiclet
      await expect(accordion.locator('.selected-chiclets .service-chiclet').first()).toBeVisible();

      // Refresh
      await page.reload();

      // Service should still be selected (chiclets visible when collapsed)
      const refreshedAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(refreshedAccordion.locator('.selected-chiclets .service-chiclet').first()).toBeVisible();
    });
  });

  test.describe('Multiple Pets', () => {
    test('should handle multiple pets', async ({ page }) => {
      await page.goto('/#schedule');

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

    test('should switch between pets in services step', async ({ page }) => {
      await page.goto('/#schedule');

      // Add two pets
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Cat1');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Dog1');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Go to services step
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Second pet should be active (just added)
      await expect(page.getByText('Services for Dog1')).toBeVisible();

      // Click on first pet (using services step pet tabs)
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Cat1' }).click();

      // First pet should now be active
      await expect(page.getByText('Services for Cat1')).toBeVisible();
    });

    test('should preserve selections when switching between pets', async ({ page }) => {
      await page.goto('/#schedule');

      // Add first pet (cat)
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Whiskers');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Add second pet (dog)
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Rover');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Go to services step
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select a service for dog (Rover is currently active)
      const dogVaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await dogVaccinesAccordion.locator('.category-header').click();
      await expect(dogVaccinesAccordion).toHaveClass(/expanded/);

      // Select DHPP for dog
      const dhppCheckbox = dogVaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'DHPP' });
      await dhppCheckbox.click();

      // Switch to cat (using services step pet tabs)
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Whiskers' }).click();
      await expect(page.getByText('Services for Whiskers')).toBeVisible();

      // Select Rabies for cat (use "Rabies 1 year" to be specific since there are multiple Rabies options)
      const catVaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await catVaccinesAccordion.locator('.category-header').click();
      const rabiesCheckbox = catVaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Rabies 1 year' });
      await rabiesCheckbox.click();

      // Switch back to dog
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Rover' }).click();
      await expect(page.getByText('Services for Rover')).toBeVisible();

      // Dog's DHPP should still be selected
      const roverVaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(roverVaccinesAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'DHPP' })).toBeVisible();

      // Switch back to cat
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Whiskers' }).click();

      // Cat's Rabies should still be selected
      const whiskersVaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(whiskersVaccinesAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'Rabies' })).toBeVisible();
    });
  });

  test.describe('State Persistence', () => {
    test('should preserve service selections after page refresh', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet and go to services
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'RefreshTest');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Expand Vaccinations and select multiple services
      const vaccinesAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await vaccinesAccordion.locator('.category-header').click();
      await expect(vaccinesAccordion).toHaveClass(/expanded/);

      // Select Rabies
      const rabiesCheckbox = vaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Rabies' });
      await rabiesCheckbox.click();

      // Select Bordetella
      const bordetellaCheckbox = vaccinesAccordion.locator('.service-checkbox').filter({ hasText: 'Bordetella' });
      await bordetellaCheckbox.click();

      // Refresh the page
      await page.reload();

      // Pet should still be there (check services step pet tabs since we're on step 2)
      await expect(page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'RefreshTest' })).toBeVisible();
      await expect(page.getByText('Services for RefreshTest')).toBeVisible();

      // Services should still be selected (check via chiclets)
      const refreshedAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(refreshedAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'Rabies' })).toBeVisible();
      await expect(refreshedAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'Bordetella' })).toBeVisible();
    });

    test('should preserve selections for multiple pets after refresh', async ({ page }) => {
      await page.goto('/#schedule');

      // Add first pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Pet1');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');

      // Add second pet
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'Pet2');
      await page.click('.pet-type-btn[data-type="cat"]');
      await page.click('#pet-modal-add');

      // Go to services
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Pet2 is active, select FVRCP
      const pet2Accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await pet2Accordion.locator('.category-header').click();
      const fvrcpCheckbox = pet2Accordion.locator('.service-checkbox').filter({ hasText: 'FVRCP' });
      await fvrcpCheckbox.click();

      // Switch to Pet1 and select Rabies (using services step pet tabs)
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Pet1' }).click();
      const pet1Accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await pet1Accordion.locator('.category-header').click();
      const rabiesCheckbox = pet1Accordion.locator('.service-checkbox').filter({ hasText: 'Rabies' });
      await rabiesCheckbox.click();

      // Refresh
      await page.reload();

      // Both pets should exist (check in services step pet tabs)
      await expect(page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Pet1' })).toBeVisible();
      await expect(page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Pet2' })).toBeVisible();

      // Pet1 should be active (was last selected)
      await expect(page.getByText('Services for Pet1')).toBeVisible();

      // Pet1's Rabies should be selected
      const pet1RefreshedAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(pet1RefreshedAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'Rabies' })).toBeVisible();

      // Switch to Pet2 and verify its selection
      await page.locator('#pet-tabs-services .pet-tab-inline').filter({ hasText: 'Pet2' }).click();
      await expect(page.getByText('Services for Pet2')).toBeVisible();

      const pet2RefreshedAccordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await expect(pet2RefreshedAccordion.locator('.selected-chiclets .service-chiclet').filter({ hasText: 'FVRCP' })).toBeVisible();
    });
  });

  test.describe('Button State', () => {
    test('should show Continue to Scheduling button when services selected', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet and go to services
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'ButtonTest');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select a service
      const accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await accordion.locator('.category-header').click();
      await accordion.locator('.service-checkbox').first().click();

      // Button should be visible with correct text
      await expect(page.locator('#continue-to-scheduling-btn')).toBeVisible();
      await expect(page.locator('#continue-to-scheduling-btn')).toContainText('Continue to Scheduling');
    });

    test('should reset button text on page refresh', async ({ page }) => {
      await page.goto('/#schedule');

      // Add a pet and go to services
      await page.click('#add-pet-btn');
      await page.fill('#pet-name-input', 'ResetBtn');
      await page.click('.pet-type-btn[data-type="dog"]');
      await page.click('#pet-modal-add');
      await page.click('#household-continue-btn');
      await page.click('#btn-existing-customer');

      // Select a service to show the button
      const accordion = page.locator('.category-accordion').filter({ hasText: 'Vaccinations' });
      await accordion.locator('.category-header').click();
      await accordion.locator('.service-checkbox').first().click();

      // Verify button shows correct text
      await expect(page.locator('#continue-to-scheduling-btn')).toContainText('Continue to Scheduling');

      // Refresh and verify button still has correct text
      await page.reload();

      await expect(page.locator('#continue-to-scheduling-btn')).toContainText('Continue to Scheduling');
      await expect(page.locator('#continue-to-scheduling-btn')).not.toContainText('Redirecting');
    });
  });

});
