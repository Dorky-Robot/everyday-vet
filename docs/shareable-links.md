# Shareable Scheduling Links

Create pre-filled scheduling links to send to clients via text, email, or any messaging platform. Links work on both the main site and the standalone scheduling page.

## Base URLs

| URL | Use Case |
|-----|----------|
| `https://everyday.vet/#schedule` | Main site with full navigation |
| `https://everyday.vet/schedule.html` | Standalone scheduling page |

## URL Parameters

### Single Pet

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| `pet` | Yes | Any string | Pet's name |
| `type` | Yes | `dog` or `cat` | Pet type |
| `new` | No | `true` or `false` | Client type (new or existing) |

**Examples:**
```
# Pet only (client chooses new/existing on next step)
?pet=Luna&type=cat

# New client
?pet=Luna&type=cat&new=true

# Existing client (goes directly to services)
?pet=Luna&type=cat&new=false
```

### Multiple Pets

| Parameter | Format | Description |
|-----------|--------|-------------|
| `pets` | `Name:type,Name:type` | Comma-separated list of pets |

**Examples:**
```
# Two pets
?pets=Luna:cat,Max:dog

# Three pets
?pets=Luna:cat,Max:dog,Buddy:dog

# Multiple pets, existing client
?pets=Luna:cat,Max:dog&new=false
```

### Pre-selected Services

| Parameter | Format | Description |
|-----------|--------|-------------|
| `svc` | `service-id,service-id` | Comma-separated service IDs |

**Service IDs:**
```
Vaccines:
  vaccine-rabies, vaccine-rabies-3yr, vaccine-dhpp, vaccine-bordetella,
  vaccine-lepto, vaccine-lyme, vaccine-flu, vaccine-fvrcp, vaccine-felv

Lab Work:
  lab-heartworm, lab-fecal, lab-blood-panel, lab-urinalysis,
  lab-thyroid, lab-4dx

Procedures:
  proc-nail-trim, proc-anal-glands, proc-ear-clean, proc-wound-care

Special:
  special-health-cert, special-euthanasia
```

**Examples:**
```
# Existing client, rabies vaccine
?pet=Luna&type=cat&new=false&svc=vaccine-rabies

# Multiple vaccines
?pet=Max&type=dog&new=false&svc=vaccine-rabies,vaccine-dhpp,vaccine-bordetella
```

### Client Info (Optional)

| Parameter | Description |
|-----------|-------------|
| `name` | Client's full name |
| `email` | Client's email |
| `phone` | Client's phone number |

**Example:**
```
?pet=Luna&type=cat&new=true&name=Jane%20Doe&email=jane@example.com
```

## Complete Examples

### New Client Consultation
Send to someone who has never visited:
```
https://everyday.vet/schedule.html?pet=Luna&type=cat&new=true
```

### Existing Client - Annual Vaccines
Send reminder for routine vaccines:
```
https://everyday.vet/schedule.html?pet=Max&type=dog&new=false&svc=vaccine-rabies,vaccine-dhpp
```

### Existing Client - Multiple Pets
Household with two pets needing services:
```
https://everyday.vet/schedule.html?pets=Luna:cat,Max:dog&new=false
```

### Quick Service Selection
Direct to services step for existing client:
```
https://everyday.vet/?pet=Whiskers&type=cat&new=false#schedule
```

## URL Encoding Notes

- Spaces in pet names: Use `%20` or `+` (e.g., `pet=Mr%20Whiskers`)
- Special characters should be URL-encoded
- Parameter order doesn't matter
- The `#schedule` anchor scrolls to the scheduler on the main page

## How It Works

1. **No params** → Start at household step (add pets)
2. **Pet params only** → Skip to customer type selection
3. **Pet + `new=true`** → Skip to new client consultation
4. **Pet + `new=false`** → Skip to services selection

## State Persistence

URLs automatically update as users fill out the form. The `?s=` parameter contains the full encoded state:

```
?s=eyJzdGVwIjoyLCJpc05ld0NsaWVudCI6ZmFsc2UsInBldHMiOlt7...
```

This encoded URL can be:
- Bookmarked to resume later
- Shared to show exact form state
- Used for debugging

## Testing Links

Before sending to clients, test links by:
1. Opening in an incognito/private window
2. Verifying the correct step loads
3. Checking pet names and types appear correctly
4. Confirming service pre-selections (if used)
