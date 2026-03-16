// /**
//  * A wrapper for API requests that allows for fluent chaining.
//  * Implements PromiseLike so it can be awaited directly for a wrapped response,
//  * or chained with .raw() for the unwrapped data.
//  * @template T The expected response data type.
//  */
// export class VynelixRequest<T> implements PromiseLike<ApiResponse<T>> {
//   constructor(private exec: (mode: ResponseMode) => Promise<ApiResponse<T> | T>) { }
//   /**
//    * Implements the then method for PromiseLike.
//    * Awaiting the request directly returns the wrapped ApiResponse.
//    */
//   then<TResult1 = ApiResponse<T>, TResult2 = never>(
//     onfulfilled?: ((value: ApiResponse<T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
//     onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
//   ): Promise<TResult1 | TResult2> {
//     return (this.exec('wrapped') as Promise<ApiResponse<T>>).then(onfulfilled, onrejected);
//   }
//   /**
//    * Returns the raw data from the API response instead of the wrapped envelope.
//    * @returns A promise that resolves to the raw data T.
//    */
//   async raw(): Promise<T> {
//     return this.exec('raw') as Promise<T>;
//   }
// }
/**
 * A configurable and robust API client for handling HTTP requests,
 * authentication headers, and automatic token refreshing.
 */
export class ApiClient {
    config;
    isRefreshing = false;
    refreshPromise;
    requestInterceptors = [];
    responseInterceptors = [];
    constructor(config) {
        this.config = {
            authType: "cookie",
            refreshEndpoint: "/auth/refresh",
            logoutEndpoint: "/auth/logout",
            shouldRefreshOnUnauthorized: () => true,
            shouldLogoutOnUnauthorizedAfterRefresh: () => true,
            ...config
        };
    }
    addRequestInterceptor(fn) {
        this.requestInterceptors.push(fn);
    }
    addResponseInterceptor(fn) {
        this.responseInterceptors.push(fn);
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
            const h = new Headers(options.headers);
            h.forEach((value, key) => {
                headers[key] = value;
            });
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
        let request = {
            ...options,
            headers: await this.getAuthHeaders(options, bodyIsFormData),
        };
        if (this.config.authType === 'cookie') {
            request.credentials = "include";
        }
        // run request interceptors
        for (const interceptor of this.requestInterceptors) {
            request = await interceptor(request);
        }
        let response = await fetch(url, request);
        // run response interceptors
        for (const interceptor of this.responseInterceptors) {
            response = await interceptor(response);
        }
        // Handle 401 Unauthorized
        if (response.status === 401 && endpoint !== this.config.refreshEndpoint) {
            const error = new Error(response.statusText);
            // retry already attempted
            if (isRetry) {
                if (this.config.shouldLogoutOnUnauthorizedAfterRefresh?.(error)) {
                    await this.handleLogout();
                }
                throw error;
            }
            const shouldRefresh = this.config.shouldRefreshOnUnauthorized?.(error) ?? true;
            // behave like original client
            if (!shouldRefresh) {
                if (responseMode === "wrapped") {
                    return { data: null };
                }
                return null;
            }
            await this.refreshToken();
            return this._fetch(endpoint, options, responseMode, true);
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
            return responseMode === 'wrapped'
                ? { data: null }
                : null;
        }
        let data;
        try {
            data = await response.json();
        }
        catch {
            data = null;
        }
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
            throw new Error("Refresh endpoint not configured");
        }
        this.isRefreshing = true;
        this.refreshPromise = (async () => {
            try {
                const fetchOptions = {
                    method: "POST",
                    headers: await this.getAuthHeaders(),
                };
                if (this.config.authType === "cookie") {
                    fetchOptions.credentials = "include";
                }
                const res = await fetch(`${this.config.baseUrl}${this.config.refreshEndpoint}`, fetchOptions);
                if (!res.ok) {
                    const error = new Error("Refresh failed");
                    if (this.config.shouldLogoutOnUnauthorizedAfterRefresh?.(error)) {
                        await this.handleLogout();
                        throw error;
                    }
                    // Ignore refresh failure (e.g. homepage case)
                    return;
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
     * @returns A promise that resolves to the response ApiResponse<T>.
     */
    get(endpoint, queryParams, options = {}) {
        const queryString = queryParams
            ? new URLSearchParams(Object.entries(queryParams)
                .filter(([_, v]) => v !== undefined && v !== null)
                .map(([k, v]) => [k, String(v)])).toString()
            : "";
        const query = queryString ? `?${queryString}` : "";
        return this._fetch(`${endpoint}${query}`, { ...options, method: 'GET' }, "wrapped");
    }
    /**
     * Performs a GET request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param queryParams Optional query parameters to append to the URL.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response data.
     */
    getData(endpoint, queryParams, options = {}) {
        const queryString = queryParams
            ? new URLSearchParams(Object.entries(queryParams)
                .filter(([_, v]) => v !== undefined && v !== null)
                .map(([k, v]) => [k, String(v)])).toString()
            : "";
        const query = queryString ? `?${queryString}` : "";
        return this._fetch(`${endpoint}${query}`, { ...options, method: 'GET' }, "raw");
    }
    /**
     * Performs a POST request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response ApiResponse<T>.
     */
    post(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'POST' }, "wrapped");
    }
    /**
     * Performs a POST request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response data.
     */
    postData(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'POST' }, "raw");
    }
    /**
     * Performs a PUT request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response ApiResponse<T>.
     */
    put(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PUT' }, "wrapped");
    }
    /**
     * Performs a PUT request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response data.
     */
    putData(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PUT' }, "raw");
    }
    /**
     * Performs a PATCH request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response ApiResponse<T>.
     */
    patch(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PATCH' }, "wrapped");
    }
    /**
     * Performs a PATCH request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response data.
     */
    patchData(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'PATCH' }, "raw");
    }
    /**
     * Performs a DELETE request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response ApiResponse<T>.
     */
    delete(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'DELETE' }, "wrapped");
    }
    /**
     * Performs a DELETE request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the response data.
     */
    deleteData(endpoint, options = {}) {
        return this._fetch(endpoint, { ...options, method: 'DELETE' }, "raw");
    }
}
