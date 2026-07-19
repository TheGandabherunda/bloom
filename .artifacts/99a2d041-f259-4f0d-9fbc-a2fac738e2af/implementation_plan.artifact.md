# Implementation Plan - Fix Track Loading and Improve API Robustness

The "Load Track Error: Could not resolve manifest URI" is caused by the backend API (`api.monochrome.tf`) returning `404 Not Found` for manifest endpoints and `403 Forbidden` for the legacy track endpoint. This typically indicates server-side issues with Tidal account sessions or account blocking.

This plan aims to refactor the client-side API interaction to be more robust, configurable, and provide better fallback mechanisms.

## User Review Required

> [!IMPORTANT]
> The `403 Forbidden` error on `https://api.monochrome.tf/track/` strongly suggests that the Tidal account used by the public API server is either blocked or its session has expired. If you are the owner of this API instance, please check your `token.json` and server logs. If you are using a public instance, consider hosting your own as per `api.md`.

## Proposed Changes

### [Services & Context]

#### [MODIFY] [monochromeApi.js](file:///A:/Development/Apps/Bloom/src/services/monochromeApi.js)
- Export `MONOCHROME_API_BASE` so it can be used by other components.
- (Optional) Add a mechanism to override the base URL via `localStorage`.

#### [MODIFY] [PlaybackContext.jsx](file:///A:/Development/Apps/Bloom/src/context/PlaybackContext.jsx)
- Import and use `MONOCHROME_API_BASE`.
- Refactor `endpoints` generation in `loadTrack` to:
    - Avoid hardcoding the domain.
    - Consistently use multiple `formats=` parameters.
    - **Add a fallback** to lower quality (`LOSSLESS` then `HIGH`) if `HI_RES_LOSSLESS` returns a 403/404.
- Improve error logging to capture status codes and response bodies when available.

### [UI / Configuration]

#### [MODIFY] [RoomSetup.jsx](file:///A:/Development/Apps/Bloom/src/components/RoomSetup.jsx) (Optional)
- Add an "Advanced" section to allow users to specify a custom API URL (e.g., `http://localhost:8000` for local testing).

## Verification Plan

### Manual Verification
- Attempt to load a track and observe the new, more detailed logs.
- Verify that if one endpoint fails with 403, the app attempts the next fallback (e.g., lower quality).
- Check that changing the API base URL (if implemented) correctly redirects all requests.

### Automated Tests
- None currently exist for this specific logic, but console logs will serve as the primary verification tool.
