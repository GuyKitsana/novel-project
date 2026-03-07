# Cold Start Recommendation Fix - Applied

## Confirmed Root Cause

**Root Cause**: `applyTopKCategoryDiversity` function was too aggressive for cold start users, filtering out category-based results.

**Evidence**:
- Location: `backend/src/services/recommend.service.ts:1514-1521`
- Function limits books by their PRIMARY category (first category ID)
- Default limit: max 2 books per primary category in top 10 (`DEFAULT_MAX_PER_CATEGORY_IN_TOP_K = 2`)
- **Problem**: If category-based results have many books with the same primary category, only 2 appear in top 10
- **Impact**: Post-processing reduces results → triggers fallback → same global popular books for all users

**Why Different Users See Same Books**:
1. Category queries return results correctly
2. Post-processing `applyTopKCategoryDiversity` filters them aggressively
3. Results reduced to 0 or very few
4. Fallback to `getPopularAll()` triggers → same global popular books for all users

## Files/Functions Updated

**File**: `backend/src/services/recommend.service.ts`

**Function Modified**: `getPersonalizedRecommendations()` (lines ~1505-1526)

**Change**: Skip `applyTopKCategoryDiversity` for cold start users (users with categories but no behavior)

## Why This Fix is Minimal and Correct

### Minimal:
- ✅ **Single conditional check**: Only skip diversity for cold start users
- ✅ **No query changes**: Category-based queries remain unchanged
- ✅ **No fallback changes**: Fallback logic remains unchanged
- ✅ **Preserves existing behavior**: Users with behavior still get diversity filtering

### Correct:
- ✅ **Cold start users need all category-based results**: They have no behavior, so diversity filtering is less important
- ✅ **Preserves category-based recommendations**: Ensures category-based results aren't filtered out
- ✅ **Different categories → Different results**: Without aggressive filtering, different category selections produce different results
- ✅ **Fallback only when truly empty**: Category-based results are preserved, so fallback only triggers if queries return 0

## Changed Logic

### Before:
```typescript
// Always apply category diversity for all users
finalResults = applyTopKCategoryDiversity({
  ranked: afterSeriesResults,
  categoryIdsByBookId,
  seenBookIds: seenBookIds ?? new Set<number>(),
  limit,
  topK: DEFAULT_TOP_K,
  maxPerCategoryInTopK: DEFAULT_MAX_PER_CATEGORY_IN_TOP_K,
});
```

### After:
```typescript
// Only apply category diversity for users with behavior
// Cold start users get all category-based results preserved
if (hasBehavior) {
  // Apply diversity filtering (for users with favorites/reviews)
  finalResults = applyTopKCategoryDiversity({...});
} else {
  // Skip diversity filtering for cold start users
  // Preserve all category-based results
  console.log("[RECOMMEND DEBUG] Skipping category diversity for cold start user");
}
```

## How It Works Now

### For Cold Start Users (hasCategories && !hasBehavior):
1. ✅ Category-based queries execute (Stage 1, 2, 3)
2. ✅ Results are collected from user's selected categories
3. ✅ Series deduplication applied (preserves category-based results)
4. ✅ **Category diversity SKIPPED** (preserves all category-based results)
5. ✅ Results returned to user
6. ✅ Fallback only triggers if category queries return 0 results

### For Users with Behavior (hasBehavior):
1. ✅ Behavior-based recommendations (TF-IDF similarity)
2. ✅ Category-based discovery (if hasCategories)
3. ✅ Series deduplication applied
4. ✅ **Category diversity APPLIED** (balances recommendations)
5. ✅ Results returned to user

## Expected Results After Fix

✅ **New users get category-based recommendations**: All category-based results are preserved

✅ **Different categories → Different results**: Without aggressive filtering, different category selections produce different books

✅ **Fallback only when empty**: Global popular books only used if category queries return 0 results

✅ **Users with behavior still get diversity**: Existing behavior preserved for users with favorites/reviews

## Testing Recommendations

To verify the fix:

1. **Create two new test users** with different category selections:
   - User A: ["fantasy", "sci_fi"]
   - User B: ["romance", "mystery_thriller"]

2. **Check recommendation results**:
   - Results should differ between users
   - Results should be from their selected categories
   - Check logs: `[RECOMMEND DEBUG] Skipping category diversity for cold start user`

3. **Verify logs show**:
   - Category-based queries return results
   - Post-processing preserves results (doesn't reduce to 0)
   - No fallback to global popular books unless categories have no books

## Summary

The fix ensures that **cold start users (new users with categories but no behavior) get all their category-based recommendations preserved** by skipping the aggressive category diversity filtering that was causing results to be filtered out. This guarantees that different category selections produce different recommendation results.
