# WhatsPoppin UI Design Handoff

This branch contains a redesigned mobile app experience for WhatsPoppin, focused on helping people quickly decide which nearby bar or nightlife venue to visit based on current crowd levels.

The work was pushed to GitHub on the `uidesign` branch:

https://github.com/jngu2029/WhatsPoppin/tree/uidesign

Commit:

```text
32d2566 Build Expo mobile crowd reporting UI
```

## What Was Built

I built a React Native and Expo mobile app frontend for the project. The app is designed to feel like a real consumer mobile app that could ship on the App Store: clean, simple, readable, and focused on the main user goal.

The main question the app answers is:

```text
Where should I go right now, and how crowded is it?
```

The app lets users:

- Browse nearby bars and nightlife venues.
- See each venue's current crowd level.
- Understand when the crowd report was last updated.
- See whether multiple recent reports agree.
- Switch between list view and map view.
- Search for bars.
- Save favorite venues.
- Open a venue detail screen.
- Report the current crowd level in a couple of taps.
- View recent personal report activity in the profile area.

## Design Direction

The UI was redesigned with a restrained, realistic mobile product style.

The design intentionally avoids the common AI-generated app look. It does not rely on purple gradients, neon effects, random decorative blobs, excessive glassmorphism, oversized marketing headings, or deeply nested cards.

Instead, the interface uses:

- Clear typography.
- Comfortable spacing.
- Strong contrast.
- Simple dividers and borders.
- Familiar bottom tab navigation.
- Direct labels.
- Practical venue rows.
- Mobile-friendly touch targets.
- A neutral visual identity that can support branding later.

The app uses crowd information as the most important visual element. Crowd levels are presented with a simple four-step system:

```text
Quiet -> Moderate -> Busy -> Packed
```

Each venue shows:

- Current crowd level.
- How fresh the report is.
- Number of agreeing recent reports.
- Distance from the user.
- Venue type.
- Wait and cover information when available.

## Main Screens

### Nearby/Home

The home screen shows nearby venues immediately. It includes:

- Current area.
- List/map switch.
- Radius control.
- Sort control.
- Crowd-level filters.
- Search shortcut.
- Venue rows with crowd meters.
- Save buttons.
- Distance and report freshness.

This screen is meant to be the fastest way to decide where to go.

### Map View

The map view shows nearby venues geographically.

On web, it uses Leaflet with OpenStreetMap tiles.

On native mobile, it uses `react-native-maps`.

Each marker reflects the venue's crowd level, so users can scan the area visually.

### Venue Detail

The detail screen prioritizes practical decision-making information:

- Venue name.
- Venue type.
- Distance.
- Current crowd level.
- Report age.
- Recent agreement.
- Crowd trend.
- Address.
- Open/closed status.
- Hours.
- Wait and cover estimate.
- Recent reports.
- Save action.
- Directions action.
- Report crowd call to action.

The report button stays easy to access because reporting is one of the app's core workflows.

### Report Crowd

The reporting flow is intentionally short.

A user chooses one of:

- Quiet
- Moderate
- Busy
- Packed

They can optionally add a wait estimate. The submit button is disabled until a crowd level is selected.

After submission, the app shows a confirmation and updates the local preview state.

### Search

The search screen lets users find venues by:

- Venue name.
- Venue type.
- City.
- Address.

It includes empty states and clear behavior for searches with no results.

### Saved

The saved screen shows favorited bars, using the same practical venue-row format as the nearby screen.

### Profile

The profile area includes:

- User/session state.
- Saved venue count.
- Report history count.
- Recent reports.
- Area context.
- Sign-in and sign-out support when connected to the backend API.

## Frontend Files Added

The new mobile app lives in:

```text
frontend/
```

Important files:

```text
frontend/App.tsx
frontend/package.json
frontend/app.json
frontend/index.ts
frontend/src/api.ts
frontend/src/data.ts
frontend/src/theme.ts
frontend/src/MapPanel.tsx
frontend/src/MapPanel.web.tsx
frontend/src/session.ts
frontend/src/session.web.ts
frontend/src/useAppDimensions.ts
frontend/src/useReducedMotion.ts
frontend/src/web.css
frontend/tokens.css
frontend/tests/crowd.test.ts
frontend/qa/verification.md
```

The frontend includes:

- Expo app setup.
- React Native screens and components.
- React Navigation.
- Web support through Expo web.
- Native and web map implementations.
- Local sample data.
- API integration layer.
- Local session handling.
- Reduced-motion handling.
- Responsive mobile sizing.
- QA screenshots.
- Tests for crowd-level behavior.

## Mobile Scaling Work

The app was adjusted to behave like a mobile app across screen sizes.

On native iOS and Android, it uses the actual device dimensions.

On web, the app is displayed as a centered mobile canvas capped at 480px wide, so the browser demo still looks like a mobile app instead of stretching into a desktop dashboard.

Tested viewport examples:

```text
320 x 740
375 x 812
390 x 844
414 x 896
768 x 1024
812 x 375 landscape
```

The landscape version uses a compact header and bottom tab height so the list remains usable.

## Backend API Work

The original Django backend was extended to support the mobile app.

Added or updated API behavior includes:

- Venue discovery endpoint.
- Crowd report creation endpoint.
- Current user's report history endpoint.
- Favorites list endpoint.
- Add/remove favorite endpoints.
- Token-based sign-in.
- Token-based sign-out.
- CORS support for local Expo web development.
- Optional SQLite mode for local setup.
- Test settings for isolated backend tests.

Important backend files changed or added:

```text
backend/config/settings.py
backend/config/urls.py
backend/config/test_settings.py
backend/venues/views.py
backend/venues/serializers.py
backend/venues/test_api.py
backend/reports/views.py
backend/favorites/views.py
backend/users/views.py
backend/requirements.txt
```

The backend still preserves the existing Django/PostgreSQL foundation. SQLite is optional for easier local development.

## API Endpoints Added

The frontend can use these endpoints when `EXPO_PUBLIC_API_URL` is configured:

```text
GET    /api/venues/
POST   /api/reports/
GET    /api/reports/mine/
GET    /api/favorites/
PUT    /api/favorites/<venue_id>/
DELETE /api/favorites/<venue_id>/
POST   /api/auth/sign-in/
POST   /api/auth/sign-out/
```

The frontend also works without an API URL by using sample preview data.

## Sample Data

The app includes clearly fictional/sample venue data for local preview.

Sample venues include:

- Looney's Pub
- Cornerstone Grill & Loft
- Terrapin's Turf
- Board & Brew
- College Park Grill

The sample data includes venue photos, coordinates, crowd reports, trend data, hours, wait estimates, cover estimates, and venue categories.

## Setup Instructions

From the repo root:

```powershell
cd C:\Users\Timothy\Downloads\WhatsPoppin-main\WhatsPoppin-main
```

Install and run the frontend:

```powershell
cd frontend
npm install
npm run web
```

Expo web runs at:

```text
http://localhost:8081
```

For Expo Go on a phone:

```powershell
npm start
```

Then scan the QR code with Expo Go.

To run the Django backend locally with SQLite:

```powershell
cd C:\Users\Timothy\Downloads\WhatsPoppin-main\WhatsPoppin-main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
$env:USE_SQLITE="1"
python backend\manage.py migrate
python backend\manage.py runserver 127.0.0.1:8000
```

To connect the frontend to the backend, create or update:

```text
frontend/.env
```

with:

```text
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api
```

## Verification Completed

The implementation was checked with:

```powershell
cd frontend
npm run typecheck
npm test
npx expo export --platform web --platform ios --platform android --output-dir dist-all
```

Backend tests were also run:

```powershell
python backend\manage.py test --settings=config.test_settings
```

The final verification covered:

- TypeScript checking.
- Frontend unit tests.
- Backend API tests.
- Expo export checks for web, iOS, and Android bundles.
- Browser QA at multiple mobile widths.
- Crowd reporting flow.
- Search flow.
- Saved venue flow.
- Map/list switching.
- Profile/report history flow.

Total tests passing at the time of handoff:

```text
29 tests
```

## Known Notes

This is a polished product prototype and app foundation, not a fully production-hardened release.

Known notes:

- Physical iOS and Android device QA still needs to be done.
- Android standalone map builds need a proper map API key configured.
- Registration and password recovery are not implemented yet.
- The browser demo uses a mobile canvas, while native apps use the full device screen.
- The project uses TypeScript 7 in the frontend because TypeScript 6 hit a compiler stack issue on this codebase.
- `npm audit` reported upstream dependency advisories through Expo/Metro-related packages. The automatic safe fix did not resolve them, and the forced fix would downgrade Expo incompatibly.
- Sample crowd reports age naturally. The app does not fake live updates.

## GitHub Branch

The work is on:

```text
uidesign
```

GitHub link:

https://github.com/jngu2029/WhatsPoppin/tree/uidesign

Pull request link:

https://github.com/jngu2029/WhatsPoppin/pull/new/uidesign

## Summary

This branch turns the WhatsPoppin backend foundation into a believable mobile nightlife app experience. It adds an Expo and React Native frontend, improves the backend API surface for venue discovery and crowd reporting, documents local setup, adds tests, and includes QA screenshots.

The main product improvement is that the app now gives users a fast, readable way to answer the core nightlife question: which nearby bar should I go to right now, and how crowded is it?
