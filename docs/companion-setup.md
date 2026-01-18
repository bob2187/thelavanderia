# Companion Network Control Setup

## Page Layout (8x4 grid)

```
Row 1: MODE SELECTION
+--------+--------+--------+--------+--------+--------+--------+--------+
|  DHCP  | STATIC | SERVER |        |        |        |        | RECOV  |
+--------+--------+--------+--------+--------+--------+--------+--------+

Row 2: IP ADDRESS DISPLAY (read-only, shows pending IP)
+--------+--------+--------+--------+--------+--------+--------+--------+
|  192   |   .    |  168   |   .    |   0    |   .    |  100   |        |
+--------+--------+--------+--------+--------+--------+--------+--------+

Row 3: IP ADJUSTMENT
+--------+--------+--------+--------+--------+--------+--------+--------+
|   +    |        |   +    |        |   +    |        |   +    | APPLY  |
+--------+--------+--------+--------+--------+--------+--------+--------+

Row 4: IP ADJUSTMENT (down buttons) + PRESETS
+--------+--------+--------+--------+--------+--------+--------+--------+
|   -    |        |   -    |        |   -    |        |   -    |        |
+--------+--------+--------+--------+--------+--------+--------+--------+

Row 5: PRESETS
+--------+--------+--------+--------+--------+--------+--------+--------+
|192.168 |192.168 | 10.0.0 |10.10.10|172.16.0|        |        |        |
|  .0    |  .1    |        |        |        |        |        |        |
+--------+--------+--------+--------+--------+--------+--------+--------+
```

## Step 1: Add Generic HTTP Connection

1. Open Companion: http://skinnypete:8000
2. Go to **Connections** tab
3. Click **Add Connection**
4. Search for "Generic HTTP"
5. Add it with these settings:
   - **Label**: `network`
   - **Base URL**: `http://localhost:5000`

## Step 2: Create Mode Buttons

### DHCP Button (Row 1, Col 1)
**Action (on press):**
- Module: Generic HTTP
- Action: GET request
- Path: `/mode/dhcp`

**Feedback:**
- Module: Generic HTTP
- Type: Check JSON value
- Path: `/state/mode/dhcp`
- JSON Path: `$.active`
- Value: `true`
- Background color when true: **Green (#00ff00)**

Add second feedback:
- JSON Path: `$.pending`
- Value: `true`
- Background color when true: **Yellow (#ffff00)**

### STATIC Button (Row 1, Col 2)
**Action:** GET `/mode/static`

**Feedbacks:** Same pattern as DHCP but polling `/state/mode/static`

### SERVER Button (Row 1, Col 3)
**Action:** GET `/mode/server`

**Feedbacks:** Same pattern polling `/state/mode/server`

## Step 3: Create IP Display Buttons

### Octet 1 Display (Row 2, Col 1)
**NO action** (display only)

**Feedback:**
- Module: Generic HTTP
- Type: Update button text from JSON
- Path: `/state/ip/0`
- JSON Path: `$.text`

Style: Large font, centered

### Dot Separator (Row 2, Col 2)
Static text: `.`
No action, no feedback

### Repeat for Octets 2, 3, 4
- Octet 2 (Col 3): polls `/state/ip/1`
- Octet 3 (Col 5): polls `/state/ip/2`
- Octet 4 (Col 7): polls `/state/ip/3`

## Step 4: Create IP Adjustment Buttons

### Octet 1 UP (Row 3, Col 1)
**Action:** GET `/ip/0/up`
**Text:** `+` or `▲`

### Octet 1 DOWN (Row 4, Col 1)
**Action:** GET `/ip/0/down`
**Text:** `-` or `▼`

### Repeat for other octets:
| Octet | UP Action | DOWN Action |
|-------|-----------|-------------|
| 1 | `/ip/0/up` | `/ip/0/down` |
| 2 | `/ip/1/up` | `/ip/1/down` |
| 3 | `/ip/2/up` | `/ip/2/down` |
| 4 | `/ip/3/up` | `/ip/3/down` |

## Step 5: Create Apply Button

### APPLY Button (Row 3, Col 8)
**Action:** GET `/apply`

**Feedback for pending changes:**
- Path: `/state/pending`
- JSON Path: `$.has_changes`
- Value: `true`
- Background: **Yellow (#ffff00)**
- Text when true: "APPLY!"

**Feedback for no changes:**
- JSON Path: `$.has_changes`
- Value: `false`
- Background: **Green (#00ff00)**
- Text when false: "OK"

## Step 6: Create Preset Buttons

### 192.168.0 Preset (Row 5, Col 1)
**Action:** GET `/preset/192.168.0`
**Text:** `192.168.0`

### Other presets:
| Button | Action |
|--------|--------|
| 192.168.1 | `/preset/192.168.1` |
| 10.0.0 | `/preset/10.0.0` |
| 10.10.10 | `/preset/10.10.10` |
| 172.16.0 | `/preset/172.16.0` |

## Step 7: Recovery Button

### RECOVERY Button (Row 1, Col 8)
**Action:** GET `/recovery`
**Text:** `RECOV` or `RESET`
**Style:** Red background as warning

## API Endpoint Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mode/dhcp` | GET | Set mode to DHCP |
| `/mode/static` | GET | Set mode to Static |
| `/mode/server` | GET | Set mode to DHCP Server |
| `/ip/{0-3}/up` | GET | Increment IP octet |
| `/ip/{0-3}/down` | GET | Decrement IP octet |
| `/preset/{name}` | GET | Load IP preset |
| `/apply` | GET | Apply pending config |
| `/apply/force` | GET | Apply without safety check |
| `/recovery` | GET | Emergency restore to DHCP |
| `/state/mode/{mode}` | GET | Get mode button state |
| `/state/ip/{0-3}` | GET | Get IP octet value |
| `/state/pending` | GET | Check if changes pending |
| `/state` | GET | Full state overview |

## Color Legend

- **Green**: Active/Applied - this is the current live configuration
- **Yellow**: Pending - selected but not yet applied (press APPLY)
- **Default/Gray**: Not selected

## Tips

1. Set feedback poll interval to 1000-2000ms for responsive updates
2. Use the same font size for all IP octet displays for alignment
3. Test with `/state` endpoint in browser to see full state
4. The API tracks pending vs applied state automatically
