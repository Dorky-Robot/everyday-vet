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

## Encoded State URLs

As you fill out the scheduling form, the browser's address bar automatically updates with the full encoded state. This creates a shareable snapshot of exactly where you are in the form.

### How to Get an Encoded URL

1. Go to the scheduling page
2. Fill out the form (add pets, select services, etc.)
3. **Copy the URL from your browser's address bar** - it will look like:
   ```
   https://everyday.vet/schedule.html?s=eyJzdGVwIjoyLCJpc05ld0NsaWVudCI6ZmFsc2UsInBldHMiOlt7...
   ```
4. Share that URL - anyone who opens it will see the exact same form state

### Use Cases

- **Resume later**: Bookmark the URL to come back to a partially filled form
- **Share exact state**: Send a link showing specific services already selected
- **Client handoff**: Fill out the form for a client, then send them the link to review and submit
- **Debugging**: Share the exact form state when reporting issues

## Programmatic URL Generation

External systems (CRMs, reminder services, integrations) can generate encoded URLs programmatically.

### State Schema

```json
{
  "step": 2,
  "isNewClient": false,
  "pets": [
    {
      "id": 1234567890,
      "name": "Luna",
      "type": "cat",
      "services": {
        "selectedIds": ["vaccine-rabies", "vaccine-fvrcp"],
        "adviceTopics": [],
        "adviceContext": "",
        "customConcerns": []
      }
    }
  ],
  "currentPetId": 1234567890,
  "client": {
    "name": "",
    "email": "",
    "phone": ""
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `step` | number | `0` = household, `1` = client type, `2` = services |
| `isNewClient` | boolean/null | `true` = new client, `false` = existing, `null` = not selected |
| `pets` | array | List of pet objects |
| `pets[].id` | number | Unique ID (use timestamp like `Date.now()`) |
| `pets[].name` | string | Pet's name |
| `pets[].type` | string | `"dog"` or `"cat"` |
| `pets[].services.selectedIds` | array | Service IDs (see list above) |
| `pets[].services.adviceTopics` | array | Advice topics selected |
| `pets[].services.adviceContext` | string | Additional context text |
| `pets[].services.customConcerns` | array | Custom concern objects |
| `currentPetId` | number | ID of the currently active pet |
| `client` | object | Client contact info (optional) |

### Encoding Algorithm

```
1. Create state object (JSON)
2. JSON.stringify(state)
3. encodeURIComponent(jsonString)
4. Replace percent-encoded bytes with characters
5. Base64 encode (btoa)
```

### JavaScript Example

```javascript
function encodeSchedulerState(state) {
  const json = JSON.stringify(state);
  const encoded = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode('0x' + p1)
    )
  );
  return encoded;
}

// Example: Create link for existing client with cat needing vaccines
const state = {
  step: 2,
  isNewClient: false,
  pets: [{
    id: Date.now(),
    name: "Luna",
    type: "cat",
    services: {
      selectedIds: ["vaccine-rabies", "vaccine-fvrcp"],
      adviceTopics: [],
      adviceContext: "",
      customConcerns: []
    }
  }],
  currentPetId: Date.now(),
  client: { name: "", email: "", phone: "" }
};

const url = `https://everyday.vet/schedule.html?s=${encodeSchedulerState(state)}`;
```

### Python Example

```python
import json
import base64
from urllib.parse import quote

def encode_scheduler_state(state):
    json_str = json.dumps(state)
    encoded = quote(json_str, safe='')
    # Convert percent-encoded to bytes
    bytes_str = bytes([
        int(encoded[i+1:i+3], 16) if encoded[i] == '%' else ord(encoded[i])
        for i in range(0, len(encoded), 3 if encoded[i:i+1] == '%' else 1)
    ])
    return base64.b64encode(bytes_str).decode('utf-8')

# Simpler alternative using just UTF-8:
def encode_scheduler_state_simple(state):
    json_str = json.dumps(state)
    return base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

# Example
state = {
    "step": 2,
    "isNewClient": False,
    "pets": [{
        "id": 1234567890,
        "name": "Luna",
        "type": "cat",
        "services": {
            "selectedIds": ["vaccine-rabies"],
            "adviceTopics": [],
            "adviceContext": "",
            "customConcerns": []
        }
    }],
    "currentPetId": 1234567890,
    "client": {"name": "", "email": "", "phone": ""}
}

url = f"https://everyday.vet/schedule.html?s={encode_scheduler_state_simple(state)}"
```

### Decoding (for verification)

```javascript
function decodeSchedulerState(encoded) {
  const json = decodeURIComponent(
    atob(encoded).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')
  );
  return JSON.parse(json);
}
```

## Testing Links

Before sending to clients, test links by:
1. Opening in an incognito/private window
2. Verifying the correct step loads
3. Checking pet names and types appear correctly
4. Confirming service pre-selections (if used)
