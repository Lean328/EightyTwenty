# EightyTwenty Till (POS) API

The documentation for the till's API (front counter POS + kitchen display, repo
`EightyTwenty-POS-Frontend-KDS`) is **published by the server**:

| Page | URL | For |
|---|---|---|
| Interactive docs (Swagger, "Try it out") | https://eightytwenty-api.onrender.com/api/docs/pos/ | Trying calls against the live API |
| Readable docs (Redoc, guide in the side menu) | https://eightytwenty-api.onrender.com/api/docs/pos/redoc/ | Reading from start to finish |
| OpenAPI schema (YAML) | https://eightytwenty-api.onrender.com/api/docs/pos/schema/ | Postman / Insomnia / code generation |

Locally: http://127.0.0.1:8000/api/docs/pos/ (same three paths).

Each page starts with the guide — connecting the till, the two sign-ins (device account, then staff
PIN), the `PosBackend` method → endpoint table, conventions (ids, order numbers, money, idempotency),
errors and what the server checks — followed by every endpoint with its description, schema,
examples and errors.

Quick start for the till's build:

```bash
VITE_DATA_PROVIDER=http
VITE_API_BASE_URL=https://eightytwenty-api.onrender.com
VITE_TERMINAL_ID=BRADDON-TILL-1
```

## Where the text lives (for whoever edits the backend)

- Guide at the top of the pages: `backend/apps/pos/guide.md`.
- Endpoint descriptions: the docstring of each view method in `backend/apps/pos/views.py`
  (summary and tag in its `@doc(...)`).
- Request/response examples: `backend/apps/pos/examples.py`.
- Field shapes: the `Pos…In` / `Pos…Out` serializers in `backend/apps/pos/serializers.py`.
- Page wiring: `backend/apps/pos/docs.py` (schema limited to `/api/v1/pos` plus login/refresh),
  routes in `backend/config/urls.py` (only when `DOCS_ENABLED`).

Change the API → update the docstring/example in the same commit; the pages update on deploy.
