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

---

## Step 4: Scheduling (Levee Integration)

After service selection, user proceeds to actual date/time booking via Levee backend.

### Architecture

```
everyday_vet (static site)  →  Levee API (https://levee.everyday.vet)
                                    ↓
                               PostgreSQL
```

Levee provides a **general-purpose public scheduling API** that can be reused by any site.

### New Levee Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/public/slots` | GET | API Key | Get available time slots |
| `/api/public/schedule` | POST | API Key | Create appointment + client + patients |

### `GET /api/public/slots`

Fetch available slots without requiring a booking token.

**Query params:**
- `siteKey` - API key for the site
- `date` - YYYY-MM-DD
- `duration` - minutes (calculated from service selection)

**Response:**
```json
{
  "date": "2025-01-20",
  "isWorkday": true,
  "officeHours": { "start": "09:00", "end": "17:00", "timezone": "America/New_York" },
  "slots": [
    { "time": "09:00", "display": "9:00 AM" },
    { "time": "09:30", "display": "9:30 AM" }
  ]
}
```

### `POST /api/public/schedule`

Create client, patients, and appointment in one transaction.

**Request:**
```json
{
  "siteKey": "evv_xxxxx",
  "client": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "household": [
    {
      "name": "Luna",
      "species": "dog",
      "services": {
        "adviceTopics": ["Anxiety or fear issues"],
        "selectedIds": ["vaccine-rabies", "vaccine-dhpp"]
      }
    }
  ],
  "appointment": {
    "date": "2025-01-20",
    "time": "10:00",
    "visitType": "in-person",
    "durationMinutes": 45,
    "notes": "Luna has been anxious during thunderstorms"
  },
  "pricing": {
    "consultationFee": 85,
    "lineItems": 95,
    "travelFee": 100,
    "total": 280
  }
}
```

**Response:**
```json
{
  "success": true,
  "confirmationCode": "EV-2025-001234",
  "appointment": {
    "id": "apt_xxx",
    "date": "2025-01-20",
    "time": "10:00",
    "displayTime": "10:00 AM"
  },
  "calendarLinks": {
    "googleCalendar": "https://calendar.google.com/...",
    "icsDownload": "data:text/calendar;..."
  }
}
```

### Site Registration

Sites are registered in Levee with API keys:

```sql
CREATE TABLE public_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key VARCHAR(50) UNIQUE NOT NULL,  -- e.g., "evv_everyday_vet"
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Step 4 UI (everyday_vet)

1. **Date Selection**
   - Calendar showing available dates
   - Grays out past dates, closed days

2. **Time Selection**
   - Shows available slots for selected date
   - Slots fetched from `/api/public/slots`

3. **Client Info**
   - Name, email, phone
   - Checkbox for SMS reminders

4. **Confirmation**
   - Summary of appointment
   - Total price
   - "Confirm Appointment" button

5. **Success Screen**
   - Confirmation code
   - Add to calendar buttons (Google, iCal)
   - "We'll send a confirmation to your email"
