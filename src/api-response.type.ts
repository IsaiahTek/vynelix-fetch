/**
 * Base structure for all API responses.
 */
type ApiBaseResponse = {
    /** Indicates if the request was successful */
    success: boolean;
    /** HTTP status code of the response */
    statusCode: number;
    /** Optional message or list of messages from the server */
    message?: string | string[];
    /** ISO timestamp of when the response was generated */
    timestamp: string;

    /** Optional metadata from the server */
    metadata?: Record<string, any>;
}

/**
 * Standard successful API response structure.
 * @template T The type of the data returned by the API.
 */
export type ApiResponse<T> = ApiBaseResponse & {
    /** The actual payload of the response */
    data: T;
};

/**
 * Detailed error response structure.
 */
export type ApiErrorResponse = ApiBaseResponse & {
    /** General error message */
    error?: string | string;
    /** List of specific error messages (e.g., validation errors) */
    errors?: string[] | string;
    /** Optional warning message */
    warning?: string;
    /** List of warning messages */
    warnings?: string[];
    /** Combined messages from the server */
    messages?: string[] | string;
}