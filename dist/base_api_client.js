/**
 * A wrapper for API requests that allows for fluent chaining.
 * Implements PromiseLike so it can be awaited directly for a wrapped response,
 * or chained with .raw() for the unwrapped data.
 * @template T The expected response data type.
 */
export class VynelixRequest {
    exec;
    constructor(exec) {
        this.exec = exec;
    }
    /**
     * Implements the then method for PromiseLike.
     * Awaiting the request directly returns the wrapped ApiResponse.
     */
    then(onfulfilled, onrejected) {
        return this.exec('wrapped').then(onfulfilled, onrejected);
    }
    /**
     * Returns the raw data from the API response instead of the wrapped envelope.
     * @returns A promise that resolves to the raw data T.
     */
    async raw() {
        return this.exec('raw');
    }
}
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
            responseMode: 'wrapped',
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
     * @param responseMode The desired response format.
     * @param isRetry Whether this is a retry attempt after a refresh.
     * @returns A promise that resolves to the API response or raw data.
     */
    async _fetch(endpoint, options = {}, responseMode = 'wrapped', isRetry = false) {
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
            if (isRetry && !this.config.shouldRefreshOnUnauthorized?.(new Error(response.statusText))) {
                const data = await response.json();
                if (responseMode === 'wrapped') {
                    return data;
                }
                return data;
            }
            if (isRetry) {
                await this.handleLogout();
                throw new Error('Unauthorized');
            }
            try {
                await this.refreshToken();
                return this._fetch(endpoint, options, responseMode, true);
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
                // Fallback if not JSON or empty
            }
            // Default message extraction logic
            let messages = ['Something went wrong'];
            if (Array.isArray(json.message)) {
                messages = json.message;
            }
            else if (json.message) {
                messages = [json.message];
            }
            else if (json.error) {
                messages = Array.isArray(json.error) ? json.error : [json.error];
            }
            else if (response.statusText) {
                messages = [response.statusText];
            }
            if (this.config.onError) {
                this.config.onError({
                    title: responseMode === 'raw' ? 'API Error' : 'Error',
                    messages,
                });
            }
            throw new Error(messages[0]);
        }
        if (response.status === 204) {
            return (responseMode === 'wrapped' ? { data: null } : null);
        }
        const data = await response.json();
        if (responseMode === 'wrapped') {
            return data;
        }
        return data;
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
     * @param options Optional request settings.
     * @returns A VynelixRequest that can be awaited or chained with .raw().
     */
    get(endpoint, queryParams, options = {}) {
        const queryString = queryParams
            ? new URLSearchParams(Object.entries(queryParams).reduce((acc, [key, val]) => {
                if (val !== undefined && val !== null) {
                    acc[key] = String(val);
                }
                return acc;
            }, {})).toString()
            : "";
        const query = queryString ? `?${queryString}` : "";
        return new VynelixRequest((mode) => this._fetch(`${endpoint}${query}`, { ...options, method: 'GET' }, mode));
    }
    /**
     * Performs a POST request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A VynelixRequest that can be awaited or chained with .raw().
     */
    post(endpoint, options = {}) {
        return new VynelixRequest((mode) => this._fetch(endpoint, { ...options, method: 'POST' }, mode));
    }
    /**
     * Performs a PUT request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A VynelixRequest that can be awaited or chained with .raw().
     */
    put(endpoint, options = {}) {
        return new VynelixRequest((mode) => this._fetch(endpoint, { ...options, method: 'PUT' }, mode));
    }
    /**
     * Performs a PATCH request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A VynelixRequest that can be awaited or chained with .raw().
     */
    patch(endpoint, options = {}) {
        return new VynelixRequest((mode) => this._fetch(endpoint, { ...options, method: 'PATCH' }, mode));
    }
    /**
     * Performs a DELETE request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A VynelixRequest that can be awaited or chained with .raw().
     */
    delete(endpoint, options = {}) {
        return new VynelixRequest((mode) => this._fetch(endpoint, { ...options, method: 'DELETE' }, mode));
    }
}
