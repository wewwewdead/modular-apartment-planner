import BASE_URL from "../src/utils/apiBaseUrl";
import apiRequest from "../src/utils/apiRequest";

const authHeaders = (token, contentType) => {
    const h = {};
    if (contentType) h['Content-Type'] = contentType;
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
};

const parseJsonError = async (response, fallback) => {
    const body = await response.json().catch(() => ({}));
    return body?.error || (typeof body === 'string' ? body : null) || fallback;
};

/**
 * Public GET request (no auth). Returns parsed JSON.
 */
export const publicGet = async (path, fallback = 'request failed') => {
    const response = await apiRequest(`${BASE_URL}${path}`, { method: 'GET' });
    if (!response.ok) throw new Error(await parseJsonError(response, fallback));
    return response.json();
};

/**
 * Authed GET request (bearer token). Returns parsed JSON.
 */
export const authedGet = async (token, path, fallback = 'request failed') => {
    const response = await apiRequest(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: authHeaders(token),
    });
    if (!response.ok) throw new Error(await parseJsonError(response, fallback));
    return response.json();
};

/**
 * Authed JSON body request. Stringifies body. Returns parsed JSON.
 */
export const authedJsonRequest = async (token, method, path, body, fallback = 'request failed') => {
    const response = await apiRequest(`${BASE_URL}${path}`, {
        method,
        headers: authHeaders(token, 'application/json'),
        body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(await parseJsonError(response, fallback));
    return response.json();
};

/**
 * Authed FormData/body request (no Content-Type — browser sets it for FormData). Returns parsed JSON.
 */
export const authedFormRequest = async (token, method, path, body, fallback = 'request failed') => {
    const response = await apiRequest(`${BASE_URL}${path}`, {
        method,
        headers: authHeaders(token),
        body,
    });
    if (!response.ok) throw new Error(await parseJsonError(response, fallback));
    return response.json();
};

export { BASE_URL, apiRequest };
