# Vynelix Fetch

A lightweight, configurable, and robust TypeScript API client library with built-in support for multiple authentication modes and automatic token refreshing.

## Features

- **Lightweight**: Zero dependencies (uses native `fetch`).
- **Multi-Auth Support**: Easily switch between `Bearer` token and `Cookie` based authentication.
- **Auto-Refresh**: Built-in logic to handle 401 Unauthorized responses and refresh tokens.
- **Customizable Callbacks**: Plug in your own notification or logging logic with `onError` and `onLogout`.
- **Fully Configurable**: Set base URLs, endpoints, and authentication types at initialization.

## Installation

```bash
npm install vynelix_fetch
# or
yarn add vynelix_fetch
```

## Basic Usage

### Initialize the Client

```typescript
import { ApiClient } from 'vynelix_fetch';

const api = new ApiClient({
  baseUrl: 'https://api.yourservice.com',
  authType: 'bearer',
  token: () => localStorage.getItem('token'), // Can be a string or a function
  onError: ({ title, messages }) => {
    // Integrate with your UI's toast or notification system
    myToast.error(title, messages.join(', '));
  },
  onLogout: () => {
    // Handle redirecting to login or clearing local state
    window.location.href = '/login';
  }
});
```

### Making Requests

You can use TypeScript generics to define the shape of the `data` in the response.

```typescript
interface User {
  id: number;
  name: string;
}

// GET request with return type
const response = await api.get<User>('/users/1');
console.log(response.data.name); // Type-safe!

// GET request with pagination/query params
const usersResponse = await api.get<User[]>('/users', { page: 1, limit: 10 });

// POST request
const newUserResponse = await api.post<User>('/users', {
  body: JSON.stringify({ name: 'John Doe' })
});

// PUT request
await api.put<User>('/users/1', {
  body: JSON.stringify({ name: 'Jane Doe' })
});

// DELETE request
await api.delete('/users/1');
```

## Configuration Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `baseUrl` | `string` | The base URL for all API requests. |
| `authType` | `'bearer' \| 'cookie'` | The authentication method to use (Default: `'cookie'`). |
| `token` | `string \| (() => string \| Promise<string>)` | The token or a function to retrieve the token (Required for `bearer`). |
| `refreshEndpoint`| `string` | The endpoint to call for token refresh (Default: `/auth/refresh`). |
| `logoutEndpoint` | `string` | The endpoint to call for logging out (Default: `/auth/logout`). |
| `onError` | `(error: { title: string; messages: string[] }) => void` | Callback triggered on request failure. |
| `onLogout` | `() => void` | Callback triggered when a session is terminated (e.g., on 401 failure). |

## Advanced Usage

### Automatic Token Refreshing

The `ApiClient` automatically handles `401 Unauthorized` responses. If a request fails with a 401 status, the client will:
1. Attempt to call the `refreshEndpoint`.
2. If successful, retry the original request.
3. If the refresh fails, it calls the `onLogout` callback.

### Custom Headers

You can pass custom headers to any request:

```typescript
await api.get('/secret-data', {
  headers: {
    'X-Custom-Header': 'CustomValue'
  }
});
```
