# Browser Persistence

Browser persistence is the shared storage boundary used by multiple domains.

## Current implementation

- Backed by `StorageManager` (`src/features/base/storage-manager.js`).
- Used by:
	- `PlanLibrary` for custom plans
	- `PracticeSessionManager` for session history
	- onboarding completion flags
	- detector parameter/device persistence

## Scope

- Stores user/session data in browser-managed storage.
- Provides no domain semantics by itself.

## Responsibility split

- Browser persistence owns storage mechanics.
- Domain modules own storage schema and validation.

## Known seam

- Multiple modules define and evolve persisted shape independently.
- Cross-module schema versioning is implicit.

## Migration target

- Keep persistence as shared infrastructure.
- Make domain-specific persisted schemas explicit in each owning feature doc.