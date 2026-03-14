import { ApiResponse } from "./api-response.type";
/**
 * Supported authentication types.
 * - 'cookie': Uses browser cookies for session management.
 * - 'bearer': Uses a Bearer token in the Authorization header.
 */
export type AuthType = 'cookie' | 'bearer';
/**
 * Supported response modes.
 * - 'wrapped': Expects an envelope structure (e.g., ApiResponse<T>).
 * - 'raw': Returns the request body data directly as T.
 */
export type ResponseMode = 'wrapped' | 'raw';
/**
 * Options for individual requests.
 */
export interface RequestOptions extends RequestInit {
    /** Override the default response mode for this specific request. */
    responseMode?: ResponseMode;
}
/**
 * Configuration options for the ApiClient.
 */
export interface ApiClientConfig {
    /** The base URL for all API requests (e.g., 'https://api.example.com') */
    baseUrl: string;
    /** The authentication mechanism to use. Defaults to 'cookie'. */
    authType?: AuthType;
    /** The default response mode for all requests. Defaults to 'wrapped'. */
    responseMode?: ResponseMode;
    /**
     * The authentication token or a function that returns the token.
     * Only used when authType is 'bearer'.
     */
    token?: string | (() => string | Promise<string>);
    /** Callback triggered when the client detects a logout (e.g., on 401 failure). */
    onLogout?: () => void;
    /** Callback triggered when an API error occurs. */
    onError?: (error: {
        title: string;
        messages: string[];
    }) => void;
    /** The endpoint used for token refreshing. Defaults to '/auth/refresh'. */
    refreshEndpoint?: string;
    /** The endpoint used for logging out. Defaults to '/auth/logout'. */
    logoutEndpoint?: string;
}
/**
 * A configurable and robust API client for handling HTTP requests,
 * authentication headers, and automatic token refreshing.
 */
export declare class ApiClient {
    private readonly config;
    private isRefreshing;
    private refreshPromise?;
    /**
     * Initializes a new instance of the ApiClient.
     * @param config Configuration options for the client.
     */
    constructor(config: ApiClientConfig);
    /**
     * Generates the authentication and content headers for a request.
     * @param options The RequestInit options.
     * @param isFileUpload Whether the request is a file upload (FormData).
     * @returns A promise that resolves to the headers object.
     */
    private getAuthHeaders;
    /**
     * Internal fetch wrapper that handles base URL, headers, and 401 retries.
     * @template T The expected response data type.
     * @param endpoint The API endpoint (relative to baseUrl).
     * @param options The fetch options and response mode.
     * @param isRetry Whether this is a retry attempt after a refresh.
     * @returns A promise that resolves to the API response or raw data.
     */
    private _fetch;
    /**
     * Triggers a token refresh request.
     * If a refresh is already in progress, it returns the existing promise.
     * @returns A promise that resolves when the refresh is complete.
     */
    refreshToken(): Promise<void>;
    /**
     * Internal helper to handle logout logic, including calling the
     * logout endpoint and triggering the onLogout callback.
     */
    private handleLogout;
    /**
     * Performs a GET request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param queryParams Optional query parameters to append to the URL.
     * @param options Optional request settings.
     * @returns A promise that resolves to the API response.
     */
    get<T>(endpoint: string, queryParams?: Record<string, any>, options?: RequestOptions): Promise<ApiResponse<T> | T>;
    /**
     * Performs a POST request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the API response.
     */
    post<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T> | T>;
    /**
     * Performs a PUT request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the API response.
     */
    put<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T> | T>;
    /**
     * Performs a PATCH request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the API response.
     */
    patch<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T> | T>;
    /**
     * Performs a DELETE request.
     * @template T The expected response data type.
     * @param endpoint The API endpoint.
     * @param options Optional request settings.
     * @returns A promise that resolves to the API response.
     */
    delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T> | T>;
}
