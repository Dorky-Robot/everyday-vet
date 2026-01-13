# Scheduling & Pricing System Specification

## Overview

A household-centric appointment booking flow for a veterinary practice offering virtual consultations (Ohio-wide) and in-person house calls (Greater Cleveland).

The core philosophy: **pets don't exist in a bubble**. They're part of a household, and care decisions affect the whole family. This is why pricing is structured around the household unit.

---

## Step 1: Your Household

First, establish who lives in the household.

- User adds all pets by name and type (dog or cat)
- Multiple pets supported
- This sets the context for everything that follows
- Pet type filters which services/items are shown later (e.g., dog vs cat vaccines)
- Persisted in localStorage

**Why this is first**: The household is the unit of care. Even if only one pet needs attention today, the vet should know about all pets in the home — it affects advice, scheduling, and pricing.

---

## Step 2: New or Existing Client

**New Client**
- Single option: 30-minute onboarding consultation
- Virtual: $75 + $10/additional pet (Anywhere in Ohio)
- In-Person: $175 + $10/additional pet (Greater Cleveland) — includes $100 travel fee
- This first visit is about meeting the whole household
- Proceeds directly to contact/booking

**Existing Client**
- Proceeds to service selection (Step 3)

---

## Step 3: Service Selection (Existing Clients)

Select services for each pet in the household.

### Service Categories

#### 1. Advice & Guidance
- **Input**: Autocomplete topic selector + freeform textarea for additional context
- **Topics**: ~40 predefined topics covering behavior, nutrition, chronic conditions, life planning, etc.
- **Visit Type**: Virtual or in-person (defaults to virtual)
- **Requires Consultation**: Yes

#### 2. Comprehensive Physical Examination
- **Input**: Single checkbox toggle
- **Visit Type**: In-person only
- **Time**: 15 minutes
- **Requires Consultation**: Yes

#### 3. Vaccinations
- **Input**: Multi-select checkboxes
- **Items**: Filtered by pet type (dog vs cat vaccines)
- **Visit Type**: In-person only
- **Auto-includes**: "Free Quick Exam" (displayed as green chiclet with tooltip explaining it's required before vaccination)
- **Pricing**: Per vaccine ($30-75 each)

#### 4. Lab Work
- **Input**: Multi-select checkboxes
- **Items**: Heartworm test (dogs), FeLV/FIV test (cats)
- **Visit Type**: In-person only
- **Pricing**: Per test ($55 each)

#### 5. Procedures
- **Input**: Multi-select checkboxes
- **Items**: Nail trim, anal gland expression (dogs), ear cleaning (dogs), minor wound care
- **Visit Type**: In-person only
- **Pricing**: Per procedure ($30-50 each)

#### 6. Special Services
- **Input**: Multi-select checkboxes
- **Items**:
  - Health certificate (interstate): $75
  - End-of-life care / euthanasia: Contact for pricing
- **Visit Type**: In-person only

#### 7. Something Else?
- **Input**: Freeform text with autocomplete suggestions (physical symptoms, specific procedures)
- **Visit Type**: Defaults to virtual, may require in-person based on nature
- **Requires Consultation**: Yes

---

## Pricing Structure

### Consultation Fee (Household-Based)
- **Base**: $75 for the household
- **Additional pets**: +$10 per additional pet in the household
- **Condition**: Charged if ANY advice/guidance topic is selected for ANY pet
- **Key principle**: The fee covers the household, not individual pets. A 3-pet household pays $95 ($75 + $10 + $10) regardless of whether advice is needed for one pet or all three. The vet is advising the family.

### Line Item Services
All other services are transactional (pay per item):
- Vaccines: $30-75 each
- Lab tests: $55 each
- Procedures: $30-50 each
- Health certificate: $75
- Euthanasia: Contact for pricing

### Travel Fee
- **Amount**: $100 (one-time, not per pet)
- **Condition**: Charged when visit type is in-person

---

## Visit Type Determination

**In-Person Visit** (Greater Cleveland Area) when ANY of these are selected:
- Comprehensive Physical Examination
- Any vaccination
- Any lab work
- Any procedure
- Any special service

**Virtual Visit** (Anywhere in Ohio) when:
- Only Advice & Guidance and/or "Something Else?" are selected
- No in-person-only services

---

## Appointment Time Estimation

Smart algorithm that understands activities overlap:

### Base
- Setup time: 5 minutes

### Discussion (Advice & Guidance + Something Else?)
- First topic: 15 minutes base
- Topics 2-3: +3 minutes each
- Topics 4-6: +2 minutes each
- Beyond 6: +1 minute each
- Rationale: Conversations flow naturally; 6 topics doesn't take 6x as long as 1

### Physical Examination
- Comprehensive exam: +15 minutes

### Vaccinations
- Any number of vaccines: +6 minutes total
- Rationale: Prep time is the bottleneck, not injection count

### Lab Work
- Per test: +3 minutes each

### Procedures
- Each procedure adds its time (10-20 min)
- Efficiency gains when multiple procedures

### Multiple Pets in Household
- Each additional pet receiving services: +65% of base time (not double)
- Rationale: Vet is already in the home, context is shared, setup is done
- Note: Time is only added for pets actually receiving hands-on services that day

---

## UI Components

### Step Navigation
- 3 dots indicating progress through the wizard
- Steps: Household → Client Type → Services (existing) or Booking (new)
- Can navigate back to previous steps

### Step 1: Household Setup
- Pet cards/tabs showing each pet in the household
- Add pet button opens modal (name + dog/cat selection)
- Remove pet option on each card
- "Continue" button (requires at least one pet)

### Step 2: Client Type
- Two large buttons: "New Client" / "Existing Client"
- New client path shows onboarding card with pricing (adjusted for household size)
- Existing client proceeds to Step 3

### Step 3: Service Selection (Existing Clients)
- Pet tabs to switch between pets
- Service category accordions
- Chiclet summary of selected items per category

### Result Card
Displays:
1. **Visit Type**: "Virtual Visit" or "In-Person Visit" with location
2. **Appointment Length**: Calculated duration with brief reasoning
3. **Price Breakdown**:
   - Consultation fee (if applicable, with pet count note)
   - Travel fee (if in-person)
   - Services & supplies total (line items)
   - **Total**
4. **Contact Form**: Email and/or phone with checkboxes for delivery preference
5. **Action Button**: "Schedule an Appointment"

### Service Chiclets
- Selected services shown as dismissible tags/chips
- "Free Quick Exam" shown as non-dismissible green chiclet when vaccines selected
- Tooltip on hover explains auto-inclusion

### Collapsible "How Pricing Works"
Reference section explaining the pricing model (collapsed by default)

---

## Data Persistence

- Pet list: localStorage
- Selected services per pet: localStorage
- Contact preferences: localStorage

---

## Edge Cases

1. **No pets added**: Cannot proceed past Step 1 — must have at least one pet
2. **No services selected**: Show empty state "Select services above to see pricing"
3. **Only vaccines selected**: Consultation-free visit (just line items + travel fee)
4. **Multiple pets, mixed services**: Single visit, single travel fee, household consultation fee if any advice selected
5. **Euthanasia selected**: Don't show price, show "Contact for pricing"
6. **Household with pets not receiving services today**: Still count toward household size for consultation fee pricing
