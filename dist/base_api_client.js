/**
 * A configurable and robust API client for handling HTTP requests,
 * authentication headers, and automatic token refreshing.
 */
export class ApiClient {
    config;
    isRefreshing = false;
    refreshPromise;
    /**
     * Initializes a new instance of the ApiClient.
     * @param config Configuration options for the client.
     */
    constructor(config) {
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
    async getAuthHeaders(options, isFileUpload = false) {
        const headers = {};
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
    async _fetch(endpoint, options = {}, isRetry = false) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const bodyIsFormData = options.body instanceof FormData;
        const fetchOptions = {
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
                return this._fetch(endpoint, options, true);
            }
            catch (error) {
                await this.handleLogout();
                throw error;
            }
        }
        if (!response.ok) {
            const text = await response.text();
            let json = {};
            try {
                json = text ? JSON.parse(text) : {};
            }
            catch (e) {
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
            return { data: null };
        }
        return response.json();
    }
    /**
     * Triggers a token refresh request.
     * If a refresh is already in progress, it returns the existing promise.
     * @returns A promise that resolves when the refresh is complete.
     */
    async refreshToken() {
        if (this.isRefreshing) {
            return this.refreshPromise;
        }
        if (!this.config.refreshEndpoint) {
            throw new Error('Refresh endpoint not configured');
        }
        this.isRefreshing = true;
        this.refreshPromise = (async () => {
            try {
                const fetchOptions = {
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
            }
            finally {
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
    async handleLogout() {
        if (this.config.logoutEndpoint) {
            const fetchOptions = {
                method: 'POST',
            };
            if (this.config.authType === 'cookie') {
                fetchOptions.credentials = 'include';
            }
            try {
                await fetch(`${this.config.baseUrl}${this.config.logoutEndpoint}`, fetchOptions);
            }
            catch (e) {
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
    async get(endpoint, queryParams) {
        const query = queryParams
            ? "?" +
                new URLSearchParams(Object.entries(queryParams).reduce((acc, [key, val]) => {
                    if (val !== undefined && val !== null) {
                        acc[key] = String(val);
                    }
                    return acc;
                }, {})).toString()
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
    async post(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'POST' });
    }
    /**
     * Performs a PUT request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional fetch settings.
     * @returns A promise that resolves to the API response.
     */
    async put(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PUT' });
    }
    /**
     * Performs a PATCH request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional fetch settings.
     * @returns A promise that resolves to the API response.
     */
    async patch(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PATCH' });
    }
    /**
     * Performs a DELETE request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional fetch settings.
     * @returns A promise that resolves to the API response.
     */
    async delete(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'DELETE' });
    }
}
