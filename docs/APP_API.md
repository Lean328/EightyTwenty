# EightyTwenty Mobile App API

The documentation for the customer mobile app's API is **published by the server**:

| Page | URL | For |
|---|---|---|
| Interactive docs (Swagger, "Try it out") | https://eightytwenty-api.onrender.com/api/docs/app/ | Trying calls against the live API |
| Readable docs (Redoc, guide in the side menu) | https://eightytwenty-api.onrender.com/api/docs/app/redoc/ | Reading from start to finish |
| OpenAPI schema (YAML) | https://eightytwenty-api.onrender.com/api/docs/app/schema/ | Postman / Insomnia / code generation |

Locally: http://127.0.0.1:8000/api/docs/app/ (same three paths).

Each page starts with the guide — connecting the app, what works today, conventions (format,
tokens, errors, idempotency, paging, rate limits), differences from the app's own
`API_CONTRACTS.md`, what the café team sees in BOS and a testing checklist — followed by every
endpoint with its description, request/response schema, examples and errors.

The app itself lives in this repo at [`mobile/`](../mobile/README.md) (Expo SDK 58); its
`.env.example` already holds the values below.

Quick start for the app's build profile:

```bash
EXPO_PUBLIC_DATA_SOURCE=api
EXPO_PUBLIC_API_BASE_URL=https://eightytwenty-api.onrender.com/api/v1/app
EXPO_PUBLIC_API_TIMEOUT_MS=60000
```

## Where the text lives (for whoever edits the backend)

- Guide at the top of the pages: `backend/apps/mobile/guide.md`.
- Endpoint descriptions: the docstring of each view method in `backend/apps/mobile/views.py`
  (summary and tag in its `@doc(...)`).
- Request/response examples: `backend/apps/mobile/examples.py`.
- Field shapes: the `…In` / `…Out` serializers in `backend/apps/mobile/serializers.py`.
- Page wiring: `backend/apps/mobile/docs.py` (schema limited to `/api/v1/app`), routes in
  `backend/config/urls.py` (only when `DOCS_ENABLED`).

Change the API → update the docstring/example in the same commit; the pages update on deploy.
