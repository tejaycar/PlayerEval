# Frontend Conventions

## UI Patterns

### Editable Tables
All data entry uses inline-editable tables:
- **Click a row** to enter edit mode (inputs replace text)
- **Empty last row** with dashed borders for adding new records (type and press Enter or blur)
- **Immediate save** — changes save on blur. No explicit save button.
- **Escape** cancels edit. **Enter** confirms.
- **Delete** — trashcan SVG icon, confirms with browser `confirm()` dialog.

### Navigation
- **Lead views:** Players, Coaches, Assignments, Player Summary
- **Coach views:** Rate Players, Results
- **Role switcher:** Leads who are also coaches see a "Switch to Coach/Lead View" button in the header

### Rating Input
- Number inputs, min 1, max 10
- Default to empty (not prefilled)
- Save fires only when ALL 5 fields are filled (prevents partial saves)
- Total auto-calculates client-side

### CSV Upload
- "Upload CSV" button opens file picker (accepts .csv)
- Validates headers deterministically — shows clear error with expected vs found headers if mismatched
- Upserts: overwrites existing records matched by number (players) or email (coaches)
- "Download Template" button provides empty CSV with correct headers

### Error Handling
- Errors shown as red banner at top of page content
- API 401 → clear auth, redirect to login
- All API errors surface the `error` field from the response

## File Organization

```
packages/frontend/src/
├── main.tsx          # Entry point
├── App.tsx           # Routes
├── api.ts            # API client (fetch wrapper)
├── index.css         # Tailwind imports
├── components/
│   └── Layout.tsx    # Header + nav + outlet
└── pages/
    ├── Login.tsx
    ├── Signup.tsx
    ├── Setup.tsx
    ├── AuthVerify.tsx
    ├── lead/
    │   ├── PlayerEntry.tsx
    │   ├── CoachEntry.tsx
    │   ├── PlayerSummary.tsx
    │   └── CoachAssignment.tsx
    └── coach/
        ├── RatePlayers.tsx
        └── Results.tsx
```

## Styling

- Tailwind CSS (v3) with default config
- Color palette: blue-600/700 primary, gray-50 background, red for errors/delete, green for success/upload, purple for invite link
- Responsive: tables overflow-x-auto on mobile
- No component library — all custom with Tailwind utilities
