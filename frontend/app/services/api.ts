// services/api.ts

// Single source of truth for API base URL
// Ensure it always ends with /api
const getApiUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) {
    // Remove trailing slash and ensure /api suffix
    const cleaned = envUrl.replace(/\/+$/, "");
    return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
  }
  return "http://localhost:3001/api";
};

const API_URL = getApiUrl();

// File base URL (for static assets like book covers, avatars)
// Remove /api suffix to get base server URL
const FILE_BASE_URL = API_URL.replace(/\/api$/, "");

/* ================== Helper: Safe Path Joining ================== */
function joinPath(base: string, path: string): string {
  // Normalize path: ensure it starts with "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Base should end with /api, so we can safely append path
  // Result: http://localhost:3001/api/auth/login (no double slashes)
  return `${base}${normalizedPath}`;
}

/* ================== Types ================== */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiOptions {
  method?: HttpMethod;
  body?: any;
  auth?: boolean; // true = แนบ token
  formData?: boolean; // true = use FormData instead of JSON
  silentStatuses?: number[]; // Status codes that should not be logged as errors (e.g., [404] for expected not found)
}

// DEBUG flag - enable with NEXT_PUBLIC_DEBUG=1
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

/* ================== Core Request ================== */
async function request(path: string, options: ApiOptions = {}) {
  const { method = "GET", body, auth = false, formData = false, silentStatuses = [] } = options;

  const headers: Record<string, string> = {};

  // Detect FormData - either explicit flag or instance check
  const isFormData = formData || (body instanceof FormData);

  // Only set Content-Type for JSON requests (FormData sets it automatically with boundary)
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // แนบ token เมื่อจำเป็น
  if (auth && typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  // Safe path joining
  const fullUrl = joinPath(API_URL, path);

  // Enhanced logging for onboarding categories endpoint
  const isOnboardingCategories = path === "/onboarding/categories" && method === "PUT";
  
  if (DEBUG || isOnboardingCategories) {
    console.log(`[API request] ${method} ${fullUrl}`, { 
      auth, 
      hasBody: !!body,
      bodyContent: isOnboardingCategories ? body : undefined,
    });
  }

  try {
    const requestBody = isFormData ? body : body ? JSON.stringify(body) : undefined;
    
    if (isOnboardingCategories) {
      console.log("[ONBOARDING API] Step 1: Request payload being sent:", {
        path,
        method,
        body: body,
        stringifiedBody: requestBody,
        hasAuth: auth,
        timestamp: new Date().toISOString(),
      });
    }
    
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: requestBody,
    });

    // Try to read response as text first (to handle both JSON and plain text)
    let responseText = "";
    try {
      responseText = await response.text();
    } catch (textError) {
      // If we can't read text, response might be empty
      responseText = "";
    }

    // Try to parse as JSON
    let data: any = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        // Not JSON, treat as plain text message
        data = { message: responseText || "Request failed" };
      }
    }

    if (DEBUG || isOnboardingCategories) {
      console.log(`[API response] ${method} ${fullUrl} - ${response.status} ${response.statusText}`);
      
      if (isOnboardingCategories) {
        console.log("[ONBOARDING API] Step 2: Response received:", {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // error จาก backend
    if (!response.ok) {
      // Build detailed error message with status, statusText, URL, and message
      const status = response.status;
      const statusText = response.statusText;
      const errorMessage = data.message || data.error || "Request failed";
      const detailedError = `[${status}] ${statusText} ${method} ${fullUrl} - ${errorMessage}`;
      
      // Create error object with additional properties
      const apiError: any = new Error(detailedError);
      apiError.status = status;
      apiError.statusText = statusText;
      apiError.url = fullUrl;
      apiError.method = method;
      apiError.responseData = data;
      apiError.responseText = responseText; // Include raw response text for debugging
      
      // Log 401/403 for debugging (these might trigger redirects)
      if (DEBUG && (status === 401 || status === 403)) {
        console.log(`[API 401/403] ${method} ${fullUrl} - Token may be invalid`);
      }
      
      // Only log error if status is not in silentStatuses (for expected errors like 404)
      if (!silentStatuses.includes(status)) {
        console.error("API request failed:", detailedError);
        if (status >= 500) {
          console.error("Server response:", responseText);
        }
      }
      
      throw apiError;
    }

    return data;
  } catch (error: any) {
    // If error already has status (from above), re-throw as-is
    if (error.status !== undefined) {
      throw error;
    }
    
    // Network/fetch errors (status 0 = network failure, CORS, backend down, etc.)
    // Do NOT log as error if it's a network error - caller should handle gracefully
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      if (DEBUG) {
        console.warn(`[API network error] ${method} ${fullUrl} - Backend may be unreachable or CORS issue`);
      }
      const networkError: any = new Error(`Failed to fetch: ${fullUrl}. Check if backend is running on port 3001 and CORS is configured.`);
      networkError.status = 0;
      networkError.url = fullUrl;
      networkError.method = method;
      networkError.isNetworkError = true;
      throw networkError;
    }
    
    // Other unexpected errors
    console.error(`[API unexpected error] ${method} ${fullUrl}`, error);
    throw error;
  }
}

/* ================== Helper Methods ================== */

// ใช้กับ login / register / create
export function apiPost(path: string, body: any, auth = false) {
  return request(path, { method: "POST", body, auth });
}

// ใช้กับ fetch ข้อมูล
export function apiGet(path: string, auth = false, options?: Partial<ApiOptions>) {
  return request(path, { method: "GET", auth, ...options });
}

// ใช้กับ update
export function apiPut(path: string, body: any, auth = false) {
  return request(path, { method: "PUT", body, auth });
}

// ใช้กับ partial update
export function apiPatch(path: string, body: any, auth = false) {
  return request(path, { method: "PATCH", body, auth });
}

// ใช้กับ delete
export function apiDelete(path: string, auth = false) {
  return request(path, { method: "DELETE", auth });
}

// ใช้กับ FormData upload
export function apiPostFormData(path: string, formData: FormData, auth = false) {
  return request(path, { method: "POST", body: formData, auth, formData: true });
}

// PUT with FormData (for file uploads)
export function apiPutFormData(path: string, formData: FormData, auth = true) {
  return request(path, { method: "PUT", body: formData, auth, formData: true });
}

// ================== Shared Book Fetching Helper ==================
/**
 * Fetch books from API with optional randomization or sorting
 * 
 * Backend endpoint: GET /api/books
 * Backend returns: { items: [...], total, page, limit }
 * 
 * @param options - Fetch options
 * @param options.limit - Number of books to fetch
 * @param options.random - If true, fetch 30 books and randomize them
 * @param options.sort - Sort mode: "recommended" for rating/favorites ranking, undefined for default
 */
export async function fetchBooks(options: { limit?: number; random?: boolean; sort?: string } = {}) {
  const { limit = 5, random = false, sort } = options;

  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append("limit", random ? "30" : limit.toString());
    if (!random) {
      params.append("offset", "0");
    }
    // Add sort parameter if specified (e.g., "recommended")
    if (sort) {
      params.append("sort", sort);
    }

    const data = await apiGet(`/books?${params.toString()}`, false);

    // Backend returns: { items: [...], total, page, limit }
    const items = Array.isArray(data.items) ? data.items : [];

    if (random) {
      // Randomize and return requested limit
      return items.sort(() => 0.5 - Math.random()).slice(0, limit);
    }

    return items;
  } catch (err) {
    console.error("fetchBooks error:", err);
    return [];
  }
}

/**
 * Fetch a single book by ID
 * Backend endpoint: GET /api/books/:id
 * Backend returns: { item: {...} } (standardized format)
 * Also handles legacy formats: { book: {...} } or direct object {...}
 * Response shape: { id, title, author, description, publisher, cover_image, buy_link, categories, rating_avg, reviews_count, favorites_count }
 * Returns null if book not found (404) or other error
 */
export async function fetchBookById(id: number | string): Promise<any | null> {
  try {
    const fullUrl = `${API_URL}/books/${id}`;
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchBookById] Fetching book id:", id, "Full URL:", fullUrl);
    }
    
    // Backend endpoint: GET /api/books/:id returns { item: {...} }
    const data = await apiGet(`/books/${id}`, false);

    if (process.env.NODE_ENV === "development") {
      console.log("[fetchBookById] Raw API response:", JSON.stringify(data, null, 2));
    }

    // Handle multiple response formats for backward compatibility
    // 1. { item: {...} } - current standard format
    // 2. { book: {...} } - legacy format
    // 3. direct object {...} - legacy format
    const book = data?.item ?? data?.book ?? data ?? null;

    if (process.env.NODE_ENV === "development") {
      console.log("[fetchBookById] Extracted book object:", book);
      console.log("[fetchBookById] Book type:", typeof book, "Is object:", typeof book === "object");
    }

    if (!book || typeof book !== "object") {
      if (process.env.NODE_ENV === "development") {
        console.warn("[fetchBookById] Invalid response data:", data);
      }
      return null;
    }

    // Extract and normalize id field (handle both id and book_id)
    const bookId = book.id ?? (book as any).book_id;
    
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchBookById] Extracted bookId:", bookId, "Type:", typeof bookId);
      console.log("[fetchBookById] Book keys:", Object.keys(book));
    }
    
    // Check if bookId exists and is valid (0 is invalid for book IDs)
    if (bookId === undefined || bookId === null || bookId === "" || (typeof bookId === "number" && (Number.isNaN(bookId) || bookId <= 0))) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[fetchBookById] Response missing or invalid id field. bookId:", bookId, "Keys:", Object.keys(book));
      }
      return null;
    }

    // Normalize cover field (in case backend/typing mismatch)
    const cover_image =
      book.cover_image ??
      (book as any).coverImage ??
      (book as any).cover ??
      null;

    // Return normalized book object with guaranteed id field
    const normalizedBook = {
      ...book,
      id: Number(bookId), // Ensure id is always a number
      cover_image,
    };

    if (process.env.NODE_ENV === "development") {
      console.log("[fetchBookById] Success - normalized book:", {
        id: normalizedBook.id,
        title: normalizedBook.title,
        hasId: !!normalizedBook.id,
        idType: typeof normalizedBook.id,
      });
    }

    return normalizedBook;
  } catch (err: any) {
    // Handle 404 (book not found) gracefully
    if (err.status === 404) {
      if (process.env.NODE_ENV === "development") {
        console.log("[fetchBookById] Book not found (404) for id:", id, "URL:", err.url);
      }
      return null;
    }
    // For other errors, log and re-throw
    console.error("fetchBookById error:", err);
    if (err.status) {
      console.error(`[fetchBookById] HTTP ${err.status} ${err.statusText} - ${err.url}`);
    }
    throw err;
  }
}

/**
 * Fetch all categories
 */
export async function fetchCategories() {
  try {
    const data = await apiGet("/categories", false);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("fetchCategories error:", err);
    return [];
  }
}

/**
 * Fetch distinct authors for filter options
 */
export async function fetchAuthors() {
  try {
    const data = await apiGet("/books/authors", false);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("fetchAuthors error:", err);
    return [];
  }
}

/**
 * Fetch distinct publishers for filter options
 */
export async function fetchPublishers() {
  try {
    const data = await apiGet("/books/publishers", false);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("fetchPublishers error:", err);
    return [];
  }
}

/**
 * Fetch books with filters (search, categories, authors, publishers)
 * Backend endpoint: GET /api/books
 * Backend returns: { items: [...], total, page, limit }
 */
export async function fetchBooksWithFilters(options: {
  q?: string;
  categories?: number[];
  authors?: string[];
  publishers?: string[];
  limit?: number;
  offset?: number;
}) {
  const { q, categories, authors, publishers, limit = 20, offset = 0 } = options;
  
  const params = new URLSearchParams();
  if (q) params.append("q", q);
  if (limit) params.append("limit", limit.toString());
  if (offset) params.append("offset", offset.toString());
  
  if (categories && categories.length > 0) {
    categories.forEach((cat) => {
      params.append("categories", cat.toString());
    });
  }
  
  if (authors && authors.length > 0) {
    authors.forEach((author) => {
      params.append("authors", author);
    });
  }
  
  if (publishers && publishers.length > 0) {
    publishers.forEach((publisher) => {
      params.append("publishers", publisher);
    });
  }
  
  const finalUrl = `/books?${params.toString()}`;
  const DEBUG_SEARCH = process.env.NEXT_PUBLIC_DEBUG_SEARCH === "1";
  if (DEBUG_SEARCH) {
    console.log("[fetchBooksWithFilters] Request URL:", finalUrl);
  }
  
  const data = await apiGet(finalUrl, false);
  
  if (DEBUG_SEARCH) {
    console.log("[fetchBooksWithFilters] Response", {
      itemsCount: Array.isArray(data.items) ? data.items.length : 0,
      total: data.total || 0,
    });
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: data.total || 0,
    page: data.page || 1,
    limit: data.limit || limit,
  };
}

/**
 * Fetch popular books (sorted by popularity score)
 * Backend endpoint: GET /api/books/popular?limit=X&timeframe=week|month|all
 * Backend returns: { items: [...] } (no total field)
 * Returns empty array on error (does not throw)
 */
export async function fetchPopularBooks(
  limit: number = 12,
  timeframe: "week" | "month" | "all" = "all"
): Promise<any[]> {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchPopularBooks] Fetching with limit:", limit, "timeframe:", timeframe);
    }
    
    // Build query string with timeframe parameter
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    if (timeframe !== "all") {
      params.append("timeframe", timeframe);
    }
    
    // Backend endpoint: GET /api/books/popular returns { items: [...] }
    const data = await apiGet(`/books/popular?${params.toString()}`, false);
    
    // Backend returns: { items: [...] }
    const items = Array.isArray(data.items) ? data.items : [];
    
    if (process.env.NODE_ENV === "development") {
      console.log("[fetchPopularBooks] Success - items count:", items.length, "first item keys:", items[0] ? Object.keys(items[0]) : []);
    }
    
    // Backend items have: id, title, author, cover_image, categories, rating_avg, reviews_count, favorites_count
    return items.map((book: any) => ({
      id: book.id,
      title: book.title || "ไม่มีชื่อเรื่อง",
      cover_image: book.cover_image || null,
      author: book.author,
      rating_avg: book.rating_avg,
      reviews_count: book.reviews_count,
      favorites_count: book.favorites_count,
      categories: book.categories || [],
    }));
  } catch (error: any) {
    // Log detailed error
    console.error("Failed to fetch popular books:", error);
    if (error.status) {
      console.error(`[fetchPopularBooks] HTTP ${error.status} ${error.statusText} - ${error.url}`);
    }
    // Return empty array instead of throwing (allows UI to show fallback)
    return [];
  }
}

/**
 * Fetch popular books for today (legacy - uses new popular endpoint)
 * @deprecated Use fetchPopularBooks instead
 */
export async function fetchPopularTodayBooks(limit: number) {
  return fetchPopularBooks(limit);
}

// ================== Authentication ==================

/**
 * Login user
 */
export async function login(email: string, password: string) {
  return await apiPost("/auth/login", { email, password }, false);
}

/**
 * Register new user
 */
export async function register(username: string, email: string, password: string) {
  return await apiPost("/auth/register", { username, email, password }, false);
}

/**
 * Get current user profile (requires auth)
 * Backend endpoint: GET /api/users/me
 */
export async function getMe() {
  return await apiGet("/users/me", true);
}

/**
 * Update current user profile
 * Backend endpoint: PUT /api/users/me
 * Mirrors admin pattern: always sends username and email
 */
export async function updateMe(payload: { username: string; email: string }) {
  return apiPut("/users/me", payload, true);
}

/**
 * Change password
 * Tries multiple endpoints for resilience
 */
export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  try {
    // Try POST /api/auth/change-password first
    return await apiPost("/auth/change-password", payload, true);
  } catch (err: any) {
    if (err.status === 404) {
      // Try POST /api/users/change-password as fallback
      try {
        return await apiPost("/users/change-password", payload, true);
      } catch (err2: any) {
        if (err2.status === 404) {
          throw new Error("Change password endpoint not available");
        }
        throw err2;
      }
    }
    throw err;
  }
}

/**
 * Upload user avatar
 * Backend endpoint: POST /api/users/me/avatar
 */
export async function uploadAvatar(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("avatar", file);
  
  // Try multiple endpoints for resilience (prefer /auth/me/avatar first, then /users/me/avatar)
  const endpoints = ["/auth/me/avatar", "/users/me/avatar"];
  
  for (const endpoint of endpoints) {
    try {
      const response = await apiPostFormData(endpoint, formData, true);
      // Ensure response has user object with avatar field
      if (response && (response.user || response)) {
        // Normalize response to always have user.avatar
        const normalized = response.user || response;
        // Support both avatar and avatar_url in response (for backward compatibility)
        if (normalized.avatar_url && !normalized.avatar) {
          normalized.avatar = normalized.avatar_url;
        }
        return response.user ? response : { user: response };
      }
      return response;
    } catch (err: any) {
      // If 404 and not the last endpoint, try next
      if (err.status === 404 && endpoint !== endpoints[endpoints.length - 1]) {
        continue;
      }
      // Otherwise throw the error
      throw err;
    }
  }
  
  throw new Error("Avatar upload endpoint not available");
}

// ================== Favorites ==================

/**
 * Get user's favorite books
 * Backend endpoint: GET /api/favorites/me
 * Backend returns: { total: number, items: [...] }
 */
export async function getFavorites() {
  try {
    const data = await apiGet("/favorites/me", true);
    return {
      total: data.total || 0,
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch (err) {
    console.error("getFavorites error:", err);
    throw err;
  }
}

/**
 * Add book to favorites
 * Backend endpoint: POST /api/favorites/:bookId
 */
export async function addFavorite(bookId: number) {
  return await apiPost(`/favorites/${bookId}`, {}, true);
}

/**
 * Remove book from favorites
 * Backend endpoint: DELETE /api/favorites/:bookId
 */
export async function removeFavorite(bookId: number) {
  return await apiDelete(`/favorites/${bookId}`, true);
}

// ================== Reviews ==================

/**
 * Get reviews for a book
 * Backend endpoint: GET /api/reviews/book/:bookId
 * Backend returns: { total: number, items: [...] }
 * Returns { items: [] } on error (does not throw)
 */
export async function getReviewsByBook(bookId: number): Promise<{ total: number; items: any[] }> {
  try {
    const data = await apiGet(`/reviews/book/${bookId}`, false);
    return {
      total: data.total || 0,
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch (err: any) {
    // Log detailed error
    console.error("Failed to fetch reviews for book:", err);
    if (err.status) {
      console.error(`[getReviewsByBook] HTTP ${err.status} ${err.statusText} - ${err.url}`);
    }
    // Return empty items array instead of throwing
    return { total: 0, items: [] };
  }
}

/**
 * Get current user's review for a book
 * Backend endpoint: GET /api/reviews/me/:bookId
 * Backend returns: DIRECT OBJECT (not wrapped) or 404
 * Returns null if user is not authenticated (401/403) or has no review (404)
 * 404 is expected when user hasn't reviewed the book yet, so it's silent
 */
export async function getMyReview(bookId: number): Promise<any | null> {
  try {
    // Use silentStatuses to prevent console.error for expected 404
    return await apiGet(`/reviews/me/${bookId}`, true, { silentStatuses: [404] });
  } catch (err: any) {
    // Handle expected errors gracefully - return null instead of throwing
    if (err.status === 404 || err.status === 401 || err.status === 403) {
      // 404 = no review yet (expected)
      // 401/403 = user not authenticated (expected for guests)
      if (process.env.NODE_ENV === "development") {
        console.log("getMyReview: No review found or user not authenticated", err.status);
      }
      return null;
    }
    // For unexpected errors, re-throw
    throw err;
  }
}

/**
 * Create or update review for a book
 * Backend endpoint: POST /api/reviews/:bookId
 */
export async function upsertReview(bookId: number, rating: number, comment?: string) {
  return await apiPost(
    `/reviews/${bookId}`,
    { rating, comment: comment || null },
    true
  );
}

/**
 * Delete review
 * Backend endpoint: DELETE /api/reviews/:reviewId
 */
export async function deleteReview(reviewId: number) {
  return await apiDelete(`/reviews/${reviewId}`, true);
}

// ================== Admin: Books ==================

/**
 * Get all books (admin - with auth)
 * Backend endpoint: GET /api/books?limit=X
 * Backend returns: { items: [...], total, page, limit }
 */
export async function adminGetBooks(limit = 1000) {
  try {
    const data = await apiGet(`/books?limit=${limit}`, true);
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.error("adminGetBooks error:", err);
    throw err;
  }
}

/**
 * Create book (admin - with file upload)
 * Backend endpoint: POST /api/books
 */
export async function adminCreateBook(formData: FormData) {
  return await apiPostFormData("/books", formData, true);
}

/**
 * Update book (admin - with optional file upload)
 * Backend endpoint: PUT /api/books/:id
 */
export async function adminUpdateBook(id: number, formData: FormData) {
  return await apiPutFormData(`/books/${id}`, formData, true);
}

/**
 * Delete book (admin)
 * Backend endpoint: DELETE /api/books/:id
 */
export async function adminDeleteBook(id: number) {
  return await apiDelete(`/books/${id}`, true);
}

// ================== Admin: Categories ==================

/**
 * Create category (admin)
 * Backend endpoint: POST /api/admin/categories
 */
export async function adminCreateCategory(name: string, code: string) {
  return await apiPost("/admin/categories", { name, code }, true);
}

/**
 * Update category (admin)
 * Backend endpoint: PUT /api/admin/categories/:id
 */
export async function adminUpdateCategory(id: number, name: string, code: string) {
  return await apiPut(`/admin/categories/${id}`, { name, code }, true);
}

/**
 * Delete category (admin)
 * Backend endpoint: DELETE /api/admin/categories/:id
 */
export async function adminDeleteCategory(id: number) {
  return await apiDelete(`/admin/categories/${id}`, true);
}

// ================== Admin: Users ==================

/**
 * Get all users (admin)
 * Backend endpoint: GET /api/admin/users
 */
export async function adminGetUsers() {
  try {
    const data = await apiGet("/admin/users", true);
    return Array.isArray(data.users) ? data.users : [];
  } catch (err) {
    console.error("adminGetUsers error:", err);
    throw err;
  }
}

/**
 * Create user (admin)
 * Backend endpoint: POST /api/admin/users
 */
export async function adminCreateUser(username: string, email: string, password: string, role: "user" | "admin") {
  return await apiPost("/admin/users", { username, email, password, role }, true);
}

/**
 * Update user (admin)
 * Backend endpoint: PUT /api/admin/users/:id
 */
export async function adminUpdateUser(id: number, username: string, email: string, password?: string, role?: "user" | "admin") {
  const payload: any = { username, email };
  if (password) payload.password = password;
  if (role) payload.role = role;
  return await apiPut(`/admin/users/${id}`, payload, true);
}

/**
 * Delete user (admin)
 * Backend endpoint: DELETE /api/admin/users/:id
 */
export async function adminDeleteUser(id: number) {
  return await apiDelete(`/admin/users/${id}`, true);
}

// ================== Admin: Reviews ==================

/**
 * Get all reviews (admin)
 * Backend endpoint: GET /api/admin/reviews
 */
export async function adminGetReviews() {
  try {
    const data = await apiGet("/admin/reviews", true);
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.error("adminGetReviews error:", err);
    throw err;
  }
}

// ================== Admin: Dashboard ==================

/**
 * Get admin dashboard stats
 * Backend endpoint: GET /api/admin/dashboard
 */
export async function adminGetDashboard() {
  return await apiGet("/admin/dashboard", true);
}


/**
 * Get admin activities
 * Backend endpoint: GET /api/admin/activities?limit=X
 */
export async function adminGetActivities(limit = 5) {
  try {
    const data = await apiGet(`/admin/activities?limit=${limit}`, true);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("adminGetActivities error:", err);
    throw err;
  }
}

// ================== Onboarding ==================

/**
 * Get onboarding status
 * Backend endpoint: GET /api/onboarding/me
 */
export async function getOnboardingStatus() {
  return await apiGet("/onboarding/me", true);
}

/**
 * Save user categories (onboarding)
 * Backend endpoint: PUT /api/onboarding/categories
 */
export async function saveUserCategories(favoriteCategories: string[]) {
  return await apiPut("/onboarding/categories", { favoriteCategories }, true);
}

/**
 * Get user's selected categories
 * Backend endpoint: GET /api/onboarding/categories
 */
export async function getUserCategories() {
  return await apiGet("/onboarding/categories", true);
}

// ================== Recommendations ==================

/**
 * Get personalized recommendations for current user
 * Backend endpoint: GET /api/recommend/me?limit=X&behaviorRatio=Y
 * Backend returns: { items: [...] }
 */
export async function getRecommendationsMe(limit: number = 20) {
  try {
    const data = await apiGet(`/recommend/me?limit=${limit}`, true);
    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch (err: any) {
    console.error("getRecommendationsMe error:", err);
    // Return empty items on error (graceful degradation)
    return { items: [] };
  }
}

/**
 * Get books similar to a given book
 * Backend endpoint: GET /api/recommend/similar/:bookId?limit=X
 * Backend returns: { items: [...] }
 */
export async function getSimilarBooks(bookId: number, limit: number = 10) {
  try {
    const data = await apiGet(`/recommend/similar/${bookId}?limit=${limit}`, false);
    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch (err: any) {
    console.error("getSimilarBooks error:", err);
    // Return empty items on error (graceful degradation)
    return { items: [] };
  }
}

/**
 * Track that a user viewed a book (optional feature)
 * Backend endpoint: POST /api/recommend/track-view/:bookId
 */
export async function trackBookView(bookId: number) {
  try {
    return await apiPost(`/recommend/track-view/${bookId}`, {}, true);
  } catch (err: any) {
    // Silent fail - this is an optional feature
    if (process.env.NODE_ENV === "development") {
      console.warn("trackBookView error (non-critical):", err);
    }
    return null;
  }
}

// ใช้แปลง path จาก backend (เช่น "/uploads/books/x.jpg" หรือ "/books/x.jpg") เป็น URL เต็ม
export function getImageUrl(path?: string | null): string {
  if (!path) return "";

  // ถ้า backend ส่ง URL เต็มมาแล้วก็ใช้ต่อได้เลย
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // ป้องกันกรณี backend ส่งมาแบบไม่มี "/" นำหน้า (เช่น "books/x.jpg")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // ตัวอย่างผลลัพธ์: http://localhost:3001/books/x.jpg หรือ http://localhost:3001/uploads/books/x.jpg
  return `${FILE_BASE_URL}${normalizedPath}`;
}

// ================== Book Cover Resolver (Frontend Helper) ==================
/**
 * Resolves book cover image path from database value to a full URL
 * 
 * Supported input formats:
 * 1. Full URL: "http://example.com/image.jpg" or "https://example.com/image.jpg"
 * 2. Relative path: "/uploads/books/cover.jpg" or "/books/cover.jpg"
 * 3. Filename only: "cover.jpg" (assumed to be in /uploads/books/)
 * 
 * @param coverImage - Cover image path from database (can be null/undefined)
 * @returns Full URL to the image, or placeholder path if invalid/missing
 */
/**
 * Resolve user avatar URL from database value
 * @param avatar - Avatar path from database (can be null/undefined)
 * @returns Full URL to the image, or null if invalid/missing
 */
export function resolveUserAvatar(avatar?: string | null): string | null {
  // No value → return null (use default icon)
  if (!avatar) {
    return null;
  }

  // Case 1: Already a full URL (http:// or https://)
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return avatar;
  }

  // Case 2: Relative path starting with /uploads/avatars/ (backend static route)
  if (avatar.startsWith("/uploads/avatars/")) {
    return `${FILE_BASE_URL}${avatar}`;
  }

  // Case 3: Relative path starting with /avatars/ (alternative static route)
  if (avatar.startsWith("/avatars/")) {
    return `${FILE_BASE_URL}${avatar}`;
  }

  // Case 4: Filename only (assume it's in /uploads/avatars/ to match backend static route)
  if (avatar.includes(".") && !avatar.includes("/")) {
    return `${FILE_BASE_URL}/uploads/avatars/${avatar}`;
  }

  // Case 5: Other formats - try prepending base URL
  return `${FILE_BASE_URL}${avatar.startsWith("/") ? avatar : `/${avatar}`}`;
}

export function resolveBookCover(coverImage?: string | null): string {
  // No value → use placeholder from public folder
  if (!coverImage) return "/placeholder-book.png";

  // Case 1: Already a full URL (http:// or https://)
  if (coverImage.startsWith("http://") || coverImage.startsWith("https://")) {
    return coverImage;
  }

  // Case 2: Relative path starting with /uploads/
  if (coverImage.startsWith("/uploads/")) {
    return `${FILE_BASE_URL}${coverImage}`;
  }

  // Case 2b: Relative path starting with /books/ (backend serves /books as static from uploads/books)
  if (coverImage.startsWith("/books/")) {
    return `${FILE_BASE_URL}${coverImage}`;
  }

  // Case 3: Filename only (e.g., "orv_5.jpg")
  // Assumes file is located in /uploads/books/
  if (coverImage.includes(".") && !coverImage.includes("/")) {
    return `${FILE_BASE_URL}/uploads/books/${coverImage}`;
  }

  // Fallback: Try getImageUrl helper for other path formats
  return getImageUrl(coverImage) || "/placeholder-book.png";
}

