The file "main"

- imports all web component definitions
- is the "main component", provides the root context

## Root DI responsibilities

- Instantiates global/shared services.
- Provides service instances via context tokens.
- Calls context notifications when service identity/readiness changes.

`main` is the composition root for service dependency injection.
