# Recommendation System Bug Analysis

## Problem Summary
Users select up to 4 favorite categories during onboarding, but the "Recommended for You" page always shows almost the same 20 books regardless of which categories users select.

## Root Cause Analysis

Based on code analysis, there are several potential root causes:

### 1. **Category-Based Query Returning 0 Results (Most Likely)**
- The `getCategoryBasedRecommendations()` function filters books by user's selected categories
- If this query returns 0 results (e.g., no books exist in those categories, or all books are excluded), the system falls back to `getPopularAll()`
- `getPopularAll()` returns the same popular books for **all users** (not filtered by categories)
- **Location**: `backend/src/services/recommend.service.ts:1164-1176`

### 2. **Books Not Properly Categorized**
- Books might not have categories assigned in the `book_categories` table
- The query uses `INNER JOIN book_categories`, so books without categories won't appear
- **Location**: `backend/src/services/recommend.service.ts:646-683`

### 3. **Popular Books Overlap Across Categories**
- Even if category filtering works, popular books might belong to multiple categories
- Different users selecting different categories might still see the same popular books
- The ORDER BY uses popularity score, so the same books always appear first

### 4. **Fallback Logic Triggering Too Often**
- The fallback condition `results.length === 0 && !hadCategoryBasedResults` might not catch all edge cases
- If category queries return some results but they're all filtered out, fallback might not trigger

## Debug Logs Added

Comprehensive debug logs have been added at all critical points:

### Frontend (Onboarding)
- **File**: `frontend/app/onboarding/categories/page.tsx:179`
- **Log**: Categories being sent to backend (`[ONBOARDING DEBUG]`)

### Backend (Onboarding Controller)
- **File**: `backend/src/controllers/onboarding.controller.ts:38-61`
- **Logs**: 
  - Categories received by backend
  - Categories stored in database with category IDs

### Backend (Recommendation Service)
- **File**: `backend/src/services/recommend.service.ts`
- **Logs**:
  - User categories retrieved from database (line ~169)
  - User data loaded (favorites, reviews, categories) (line ~992)
  - Recommendation method used (behavior-based/category-based/random-fallback)
  - Category-based query parameters (line ~635)
  - Category-based query results (line ~689)
  - Stage 1 (Category-based) results (line ~1120)
  - Stage 2 (Controlled Random) results (line ~1146)
  - Final recommended book IDs (line ~1399)
  - Post-processing results

### Backend (Recommendation Controller)
- **File**: `backend/src/controllers/recommend.controller.ts:33-58`
- **Logs**: Request params and response with all book IDs

## How to Debug

1. **Run the application** and check console logs
2. **Select different categories** for different users during onboarding
3. **Check the logs** to see:
   - Are categories being sent correctly? (`[ONBOARDING DEBUG]`)
   - Are categories stored correctly? (`[ONBOARDING DEBUG] Categories stored`)
   - Are categories retrieved correctly? (`[RECOMMEND DEBUG] User categories retrieved`)
   - Which recommendation method is used? (`[RECOMMEND DEBUG] Using category-based recommendation method`)
   - Do category-based queries return results? (`[RECOMMEND DEBUG] Category-based query results`)
   - Are final results the same for different users? (`[RECOMMEND DEBUG] Final recommended book IDs`)

## Expected Behavior

1. User selects categories → Categories stored in `user_categories` table
2. Recommendation request → Categories retrieved from `user_categories`
3. Category-based query → Books filtered by user's categories
4. Results → Different books for different category selections

## Potential Fixes

### Fix 1: Ensure Fallback Only When Necessary
If category-based queries return 0 results, ensure the fallback is triggered and logged clearly.

### Fix 2: Verify Books Have Categories
Check if books in the database have categories assigned. If not, this explains why category filtering returns 0 results.

### Fix 3: Improve Category Diversity
If popular books overlap across categories, consider:
- Adding more randomization to category-based results
- Using category diversity scoring to ensure different categories are represented
- Limiting how many books from the same category appear in results

### Fix 4: Add Category Validation
Before falling back to popular books, verify:
- User has categories selected
- Books exist in those categories
- Query is executing correctly

## Next Steps

1. **Run with debug logs** to identify the exact issue
2. **Check database** to verify:
   - `user_categories` table has entries for test users
   - `book_categories` table has entries linking books to categories
   - Categories exist in `categories` table
3. **Test with different category selections** and compare logs
4. **Fix the identified root cause** based on log findings

## Files Modified

1. `frontend/app/onboarding/categories/page.tsx` - Added debug log for categories sent
2. `backend/src/controllers/onboarding.controller.ts` - Added debug logs for categories received/stored
3. `backend/src/services/recommend.service.ts` - Added comprehensive debug logs throughout recommendation flow
4. `backend/src/controllers/recommend.controller.ts` - Added debug logs for request/response

All debug logs are now **always enabled** (not just in non-production) to help identify the issue.
