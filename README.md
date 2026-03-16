# Vynelix Fetch

A lightweight, configurable, and robust TypeScript API client library with built-in support for multiple authentication modes, automatic token refreshing, and request/response interceptors.

## Features

- **Lightweight**: Zero dependencies — uses native `fetch`.
- **Multi-Auth Support**: Switch between `Bearer` token and `Cookie`-based authentication.
- **Auto-Refresh**: Automatically handles `401 Unauthorized` responses by refreshing the token and retrying the original request.
- **Dual Response Modes**: Every HTTP method has a `wrapped` variant (returns `ApiResponse<T>`) and a `raw` variant (returns `T` directly).
- **Interceptors**: Add request and response interceptors for logging, tracing, or header injection.
- **Customizable Callbacks**: Plug in your own error notifications and logout logic.
- **Fine-Grained Refresh Control**: Control exactly when to refresh and when to trigger a logout with custom callbacks.

## Installation

```bash
npm install @vynelix/fetch
# or
yarn add @vynelix/fetch
```

## Basic Usage

### Initialize the Client

```typescript
import { ApiClient } from '@vynelix/fetch';

const api = new ApiClient({
  baseUrl: 'https://api.yourservice.com',
  authType: 'bearer',
  token: () => localStorage.getItem('token'), // string or function (sync/async)
  onError: ({ title, messages }) => {
    myToast.error(title, messages.join(', '));
  },
  onLogout: () => {
    window.location.href = '/login';
  },
});
```

### Making Requests

Each HTTP verb has two variants:

| Variant | Returns | Use when |
| :--- | :--- | :--- |
| `get`, `post`, `put`, `patch`, `delete` | `ApiResponse<T>` | Your server wraps responses in an envelope |
| `getData`, `postData`, `putData`, `patchData`, `deleteData` | `T` | Your server returns the data directly |

```typescript
interface User {
  id: number;
  name: string;
}

// --- Wrapped mode (ApiResponse<T>) ---

// GET with optional query params
const response = await api.get<User>('/users/1');
console.log(response.data.name); // type-safe

// GET with query params
const listRes = await api.get<User[]>('/users', { page: 1, limit: 10 });

// POST with a body
const created = await api.post<User>('/users', {
  body: JSON.stringify({ name: 'John Doe' }),
});

// PUT / PATCH / DELETE
await api.put<User>('/users/1', { body: JSON.stringify({ name: 'Jane Doe' }) });
await api.patch<User>('/users/1', { body: JSON.stringify({ name: 'Jane' }) });
await api.delete('/users/1');

// --- Raw mode (T) ---

// GET — returns User directly, no .data wrapper
const user = await api.getData<User>('/users/1');
console.log(user.name);

// POST — returns the created resource directly
const newUser = await api.postData<User>('/users', {
  body: JSON.stringify({ name: 'John Doe' }),
});

// PUT / PATCH / DELETE raw variants
await api.putData<User>('/users/1', { body: JSON.stringify({ name: 'Jane' }) });
await api.patchData<User>('/users/1', { body: JSON.stringify({ name: 'Jane' }) });
await api.deleteData('/users/1');
```

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string` | — | Base URL for all API requests. |
| `authType` | `'bearer' \| 'cookie'` | `'cookie'` | Authentication method. |
| `token` | `string \| (() => string \| Promise<string>)` | — | Token or async function to retrieve it. Required when `authType` is `'bearer'`. |
| `refreshEndpoint` | `string` | `'/auth/refresh'` | Endpoint called to refresh the access token. |
| `logoutEndpoint` | `string` | `'/auth/logout'` | Endpoint called when terminating a session. |
| `onError` | `(error: { title: string; messages: string[] }) => void` | — | Callback triggered on a failed request. |
| `onLogout` | `() => void` | — | Callback triggered when the session is terminated. |
| `shouldRefreshOnUnauthorized` | `(error: Error) => boolean` | `() => true` | Control whether a token refresh is attempted on a 401 response. |
| `shouldLogoutOnUnauthorizedAfterRefresh` | `(error: Error) => boolean` | `() => true` | Control whether logout is triggered when the retry after refresh also fails. |

## Advanced Usage

### Automatic Token Refreshing

When a request returns `401 Unauthorized`, the client will:

1. Check `shouldRefreshOnUnauthorized` — skip refresh and return if it returns `false`.
2. Call `refreshEndpoint` (deduplicated: concurrent requests share one refresh).
3. Retry the original request once.
4. If the retry also fails, check `shouldLogoutOnUnauthorizedAfterRefresh` — if `true`, call `logoutEndpoint` and trigger `onLogout`.

You can also trigger a refresh manually:

```typescript
await api.refreshToken();
```

### Fine-Grained Refresh Control

```typescript
const api = new ApiClient({
  baseUrl: 'https://api.yourservice.com',
  authType: 'bearer',
  token: getToken,

  // Don't refresh on public/optional endpoints
  shouldRefreshOnUnauthorized: (error) => {
    return !isPublicRoute(window.location.pathname);
  },

  // Only log out if the refresh itself resulted in an auth failure
  shouldLogoutOnUnauthorizedAfterRefresh: (error) => {
    return error.message === 'Refresh failed';
  },
});
```

### Request & Response Interceptors

Use interceptors to inject headers, log traffic, or modify responses globally.

```typescript
// Request interceptor — runs before every request
api.addRequestInterceptor(async (req) => {
  console.log('[Request]', req.method);
  return {
    ...req,
    headers: {
      ...req.headers,
      'X-Request-ID': crypto.randomUUID(),
    },
  };
});

// Response interceptor — runs after every response
api.addResponseInterceptor(async (res) => {
  console.log('[Response]', res.status);
  return res;
});
```

### Custom Headers Per Request

```typescript
await api.get('/admin/data', {}, {
  headers: {
    'X-Custom-Header': 'CustomValue',
  },
});
```

### File Uploads

Pass a `FormData` body and the client will automatically omit the `Content-Type` header so the browser can set the correct `multipart/form-data` boundary.

```typescript
const form = new FormData();
form.append('avatar', file);

await api.postData<{ url: string }>('/upload', { body: form });
```

## Response Types

```typescript
// Wrapped response (ApiResponse<T>)
type ApiResponse<T> = {
  success: boolean;
  statusCode: number;
  message?: string | string[];
  timestamp: string;
  metadata?: Record<string, any>;
  data: T;
};
```

## License

MIT — © Engr., Isaiah Pius E.
