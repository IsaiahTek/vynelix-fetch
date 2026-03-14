import { ApiResponse } from "./api-response.type";

/**
 * Supported authentication types.
 * - 'cookie': Uses browser cookies for session management.
 * - 'bearer': Uses a Bearer token in the Authorization header.
 */
export type AuthType = 'cookie' | 'bearer';

/**
 * Configuration options for the ApiClient.
 */
export interface ApiClientConfig {
  /** The base URL for all API requests (e.g., 'https://api.example.com') */
  baseUrl: string;
  /** The authentication mechanism to use. Defaults to 'cookie'. */
  authType?: AuthType;
  /** 
   * The authentication token or a function that returns the token.
   * Only used when authType is 'bearer'.
   */
  token?: string | (() => string | Promise<string>);
  /** Callback triggered when the client detects a logout (e.g., on 401 failure). */
  onLogout?: () => void;
  /** Callback triggered when an API error occurs. */
  onError?: (error: { title: string; messages: string[] }) => void;
  /** The endpoint used for token refreshing. Defaults to '/auth/refresh'. */
  refreshEndpoint?: string;
  /** The endpoint used for logging out. Defaults to '/auth/logout'. */
  logoutEndpoint?: string;
}

/**
 * A configurable and robust API client for handling HTTP requests, 
 * authentication headers, and automatic token refreshing.
 */
export class ApiClient {
  private readonly config: ApiClientConfig;
  private isRefreshing = false;
  private refreshPromise?: Promise<void>;

  /**
   * Initializes a new instance of the ApiClient.
   * @param config Configuration options for the client.
   */
  constructor(config: ApiClientConfig) {
    this.config = {
      authType: 'cookie',
      refreshEndpoint: '/auth/refresh',
      logoutEndpoint: '/auth/logout',
      ...config,
    };
  }

  /**
   * Generates the authentication and content headers for a request.
   * @param options The RequestInit options.
   * @param isFileUpload Whether the request is a file upload (FormData).
   * @returns A promise that resolves to the headers object.
   */
  private async getAuthHeaders(options?: RequestInit, isFileUpload: boolean = false): Promise<HeadersInit> {
    const headers: Record<string, string> = {};

    if (!isFileUpload) {
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
    }

    if (this.config.authType === 'bearer' && this.config.token) {
      const token = typeof this.config.token === 'function' 
        ? await this.config.token() 
        : this.config.token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    return headers;
  }

  /**
   * Internal fetch wrapper that handles base URL, headers, and 401 retries.
   * @template T The expected response data type.
   * @param endpoint The API endpoint (relative to baseUrl).
   * @param options The fetch options.
   * @param isRetry Whether this is a retry attempt after a refresh.
   * @returns A promise that resolves to the API response.
   */
  private async _fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const bodyIsFormData = options.body instanceof FormData;

    const fetchOptions: RequestInit = {
      ...options,
      headers: await this.getAuthHeaders(options, bodyIsFormData),
    };

    if (this.config.authType === 'cookie') {
      fetchOptions.credentials = "include";
    }

    const response = await fetch(url, fetchOptions);

    // Handle 401 Unauthorized
    if (response.status === 401 && endpoint !== this.config.refreshEndpoint) {
      if (isRetry) {
        await this.handleLogout();
        throw new Error('Unauthorized');
      }

      try {
        await this.refreshToken();
        return this._fetch<T>(endpoint, options, true);
      } catch (error) {
        await this.handleLogout();
        throw error;
      }
    }

    if (!response.ok) {
      const text = await response.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch (e) {
        // Fallback if not JSON
      }

      const messages = Array.isArray(json.message)
        ? json.message
        : [json.message ?? 'Something went wrong'];

      if (this.config.onError) {
        this.config.onError({
          title: 'Error',
          messages,
        });
      }

      throw new Error(json.message ?? 'Request failed');
    }

    if (response.status === 204) {
      return { data: null } as unknown as ApiResponse<T>;
    }

    return response.json();
  }

  /**
   * Triggers a token refresh request.
   * If a refresh is already in progress, it returns the existing promise.
   * @returns A promise that resolves when the refresh is complete.
   */
  public async refreshToken(): Promise<void> {
    if (this.isRefreshing) {
      return this.refreshPromise!;
    }

    if (!this.config.refreshEndpoint) {
      throw new Error('Refresh endpoint not configured');
    }

    this.isRefreshing = true;

    this.refreshPromise = (async () => {
      try {
        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: await this.getAuthHeaders(),
        };

        if (this.config.authType === 'cookie') {
          fetchOptions.credentials = 'include';
        }

        const res = await fetch(`${this.config.baseUrl}${this.config.refreshEndpoint}`, fetchOptions);

        if (!res.ok) {
          throw new Error('Refresh failed');
        }
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = undefined;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Internal helper to handle logout logic, including calling the 
   * logout endpoint and triggering the onLogout callback.
   */
  private async handleLogout() {
    if (this.config.logoutEndpoint) {
      const fetchOptions: RequestInit = {
        method: 'POST',
      };
      if (this.config.authType === 'cookie') {
        fetchOptions.credentials = 'include';
      }
      
      try {
        await fetch(`${this.config.baseUrl}${this.config.logoutEndpoint}`, fetchOptions);
      } catch (e) {
        // Ignore logout errors
      }
    }

    if (this.config.onLogout) {
      this.config.onLogout();
    }
  }

  /**
   * Performs a GET request.
   * @template T The expected response data type.
   * @param endpoint The API endpoint.
   * @param queryParams Optional query parameters to append to the URL.
   * @returns A promise that resolves to the API response.
   */
  async get<T>(endpoint: string, queryParams?: Record<string, any>): Promise<ApiResponse<T>> {
    const query = queryParams
      ? "?" +
      new URLSearchParams(
        Object.entries(queryParams).reduce((acc, [key, val]) => {
          if (val !== undefined && val !== null) {
            acc[key] = String(val);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString()
      : "";
    return this._fetch(`${endpoint}${query}`, { method: 'GET' });
  }

  /**
   * Performs a POST request.
   * @template T The expected response data type.
   * @param endpoint The API endpoint.
   * @param options Optional fetch settings (e.g., body).
   * @returns A promise that resolves to the API response.
   */
  async post<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this._fetch(endpoint, { ...options, method: 'POST' });
  }

  /**
   * Performs a PUT request.
   * @template T The expected response data type.
   * @param endpoint The API endpoint.
   * @param options Optional fetch settings.
   * @returns A promise that resolves to the API response.
   */
  async put<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this._fetch(endpoint, { ...options, method: 'PUT' });
  }

  /**
   * Performs a PATCH request.
   * @template T The expected response data type.
   * @param endpoint The API endpoint.
   * @param options Optional fetch settings.
   * @returns A promise that resolves to the API response.
   */
  async patch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this._fetch(endpoint, { ...options, method: 'PATCH' });
  }

  /**
   * Performs a DELETE request.
   * @template T The expected response data type.
   * @param endpoint The API endpoint.
   * @param options Optional fetch settings.
   * @returns A promise that resolves to the API response.
   */
  async delete<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this._fetch(endpoint, { ...options, method: 'DELETE' });
  }
}

