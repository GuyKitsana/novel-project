# Investigation Findings: New User Recommendation Issue

## Step-by-Step Flow Analysis

### Step 1: Frontend Onboarding Category Selection
**File**: `frontend/app/onboarding/categories/page.tsx`
- **Line 186-190**: Sends `{ favoriteCategories: selected }` via `apiPut("/onboarding/categories", ...)`
- **Evidence**: `selected` is an array of category codes like `['fantasy', 'romance']`
- **Status**: ✅ Correctly sends category codes

### Step 2: Backend Receives and Stores Categories
**File**: `backend/src/controllers/onboarding.controller.ts`
- **Line 38**: Receives `favoriteCategories` from request body
- **Line 56-60**: Looks up category IDs from `categories` table using `code`
- **Line 64-67**: Inserts into `user_categories` table with `user_id` and `category_id`
- **Evidence**: Stores category IDs (not codes) in `user_categories` table
- **Status**: ✅ Correctly stores category IDs

### Step 3: Fetching User Categories for Recommendations
**File**: `backend/src/services/recommend.service.ts`
- **Line 154-185**: `fetchUserCategories(userId)` function
- **Line 156**: Query: `SELECT category_id FROM user_categories WHERE user_id = $1`
- **Line 159**: Returns `Set<number>` of category IDs
- **Evidence**: Correctly retrieves category IDs from database
- **Status**: ✅ Correctly retrieves category IDs

### Step 4: Detection of New User (No Behavior)
**File**: `backend/src/services/recommend.service.ts`
- **Line 1063**: `hasBehavior = userFavorites.size > 0 || userReviews.size > 0`
- **Line 1064**: `hasCategories = userCategories.size > 0`
- **Line 1186-1189**: For new users: `if (!hasBehavior && hasCategories)` → Cold start path
- **Evidence**: Correctly detects new users with categories but no behavior
- **Status**: ✅ Correctly detects cold start users

### Step 5: Category-Based Recommendation Query
**File**: `backend/src/services/recommend.service.ts`
- **Line 622-718**: `getCategoryBasedRecommendations()` function
- **Line 651/671**: SQL Query: `WHERE bc.category_id = ANY($1::int[])`
- **Line 631**: Converts `Set<number>` to array: `const categoryArray = Array.from(userCategoryIds)`
- **Evidence**: Query correctly filters books by user's category IDs
- **Status**: ✅ Query logic is correct

### Step 6: Post-Processing - CRITICAL ISSUE FOUND
**File**: `backend/src/services/recommend.service.ts`

#### Issue 1: `applySeriesDedupeAndNextVolumeRule` Function
**Line 475-546**: This function has a problematic first loop:
- **Line 503**: `if (!nextVolumeBookIds.has(book.id)) continue;`
- **Problem**: For new users with no favorites:
  - `getSeenAndSeriesProgress()` returns empty `seriesMaxVolume` (line 208)
  - `getNextVolumeCandidates()` returns empty `nextVolumeBookIds` (line 258-325)
  - First loop processes NOTHING (skips all books)
  - Second loop processes all books (line 523-543)
- **Impact**: Should still work, but inefficient

#### Issue 2: `applyTopKCategoryDiversity` Function - POTENTIAL ROOT CAUSE
**Line 369-472**: This function limits books by PRIMARY category:
- **Line 404-410**: `getPrimaryCategoryId()` gets FIRST category ID from book's categories
- **Line 427-432**: Limits to `maxPerCategoryInTopK` (default 2) per category in top 10
- **CRITICAL PROBLEM**: 
  - This limits by the BOOK's primary category, NOT checking if it matches USER's selected categories
  - If user selects categories [1, 2, 3] but books have primary categories [4, 5, 6], the diversity filter might incorrectly filter books
  - However, books should already be filtered by user categories, so this shouldn't be the issue

#### Issue 3: Post-Processing Fallback Logic
**Line 1537-1600**: If post-processing returns 0 results:
- **Line 1544**: Checks if `categoryBasedBookIds.size > 0`
- **Line 1549-1555**: Reverts to category-based books
- **Status**: ✅ Has protection for category-based results

### Step 7: API Response
**File**: `backend/src/controllers/recommend.controller.ts`
- **Line 39-43**: Calls `getPersonalizedRecommendations()`
- **Line 46**: Returns `{ items: recommendations }`
- **Status**: ✅ Correctly returns results

### Step 8: Frontend Rendering
**File**: `frontend/app/recommend/page.tsx`
- **Line 50**: Calls `getRecommendationsMe(20)`
- **Line 96**: Sets recommendations: `setRecommendations(items)`
- **Line 62-95**: Has fallback to popular books if empty
- **Status**: ✅ Correctly renders results

## Root Cause Analysis

### Hypothesis 1: Category Query Returns 0 Results
**Evidence Check**:
- Query logic at line 651/671: `WHERE bc.category_id = ANY($1::int[])`
- This should correctly filter books by user's category IDs
- **Verdict**: Query logic appears correct, but need to verify:
  - Are books actually linked to categories in `book_categories` table?
  - Do category IDs match between `user_categories` and `book_categories`?

### Hypothesis 2: Post-Processing Removes All Category-Based Results
**Evidence Check**:
- `applySeriesDedupeAndNextVolumeRule`: Should still work for new users (second loop processes all)
- `applyTopKCategoryDiversity`: Limits by book's primary category, not user's categories
- **CRITICAL FINDING**: The diversity function limits by book's PRIMARY category, which might not align with user's selected categories
- **Verdict**: This could be filtering out category-based results incorrectly

### Hypothesis 3: Fallback Triggered Too Early
**Evidence Check**:
- Line 1283: Only falls back if `results.length === 0`
- Line 1304: Only uses global fallback if `totalBooksInCategories === 0`
- **Verdict**: Fallback logic appears correct

### Hypothesis 4: Same Books Because of Popularity Ordering
**Evidence Check**:
- Line 654-660: Orders by popularity score: `(favorites_count * 3 + reviews_count * 2 + avg_rating) DESC`
- If books in different categories have similar popularity scores, they might appear in same order
- **Verdict**: This could cause similar books to appear, but they should still be filtered by category

## Confirmed Root Cause

After analyzing the code, I found **ONE CRITICAL ISSUE**:

### Issue: `applyTopKCategoryDiversity` May Filter Out Category-Based Results

**Location**: `backend/src/services/recommend.service.ts:369-472`

**Problem**:
1. The function limits books by their PRIMARY category (first category ID)
2. It doesn't verify that the primary category matches the USER's selected categories
3. For new users, if category-based results have books with primary categories that don't match user's selections (even though books are IN user's categories), the diversity filter might incorrectly limit them
4. However, this shouldn't happen if books are correctly filtered by user categories first

**But wait**: The real issue might be simpler - if the category-based query returns books, but they all have the same primary category, and `maxPerCategoryInTopK = 2`, then only 2 books from that category would appear in top 10, even if user selected multiple categories.

**Example Scenario**:
- User selects categories: [1, 2, 3] (fantasy, romance, sci_fi)
- Category query returns 20 books, all with primary category = 1 (fantasy)
- `applyTopKCategoryDiversity` limits to 2 books with primary category 1 in top 10
- Result: Only 2 books appear, rest filtered out
- If post-processing reduces to 0, fallback triggers → same popular books for all users

## Evidence Needed

To confirm the root cause, we need to check:
1. **Database State**: Do books in `book_categories` actually have entries linking them to user's selected categories?
2. **Query Results**: Does `getCategoryBasedRecommendations` actually return books for different category selections?
3. **Post-Processing Impact**: Does `applyTopKCategoryDiversity` reduce results to 0 for new users?

## Proposed Minimal Fix

Based on the investigation, the fix should:
1. **Skip or modify `applyTopKCategoryDiversity` for cold start users** - Don't limit by book's primary category if user has no behavior
2. **Verify category-based queries return results** - Add validation to ensure books exist in user's categories
3. **Preserve category-based results in post-processing** - Ensure category-based books aren't filtered out

However, I need to verify the actual database state and query results before proposing the exact fix.
