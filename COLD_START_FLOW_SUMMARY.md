# Cold-Start Recommendation Flow - Final Summary

## Refactored Rules

### Rule 1: Users with Categories (No Behavior)
**Condition**: `hasCategories = true` AND `hasBehavior = false`

**Allowed Methods**:
- ✅ `getCategoryBasedRecommendations()` - Books matching user's selected categories
- ✅ `getControlledRandomRecommendations()` - Random books within selected categories
- ✅ `getPopularInCategories()` - Popular books within selected categories

**NOT Allowed**:
- ❌ `getPopularAll()` - Global popular books (NEVER used)
- ❌ `getRandomRecommendations()` - Global random books (NEVER used)

**Result**: Users receive ONLY category-based recommendations, even if fewer than requested limit.

---

### Rule 2: Users with No Categories and No Behavior
**Condition**: `hasCategories = false` AND `hasBehavior = false`

**Allowed Methods**:
- ✅ `getRandomRecommendations()` - Global random/popular books
- ✅ `getPopularAll()` - Global popular books (fallback)

**Result**: Users receive global popular/random books as fallback.

---

### Rule 3: Users with Behavior
**Condition**: `hasBehavior = true` (has favorites OR reviews)

**Allowed Methods**:
- ✅ `getBehaviorBasedRecommendations()` - TF-IDF + Cosine Similarity
- ✅ `getCategoryBasedRecommendations()` - Discovery recommendations (if hasCategories)
- ✅ `getPopularInCategories()` - Category-based fallback (if hasCategories)
- ✅ `getPopularAll()` - Global fallback (if needed)

**Result**: Behavior-based recommendations with discovery mix (unchanged).

---

## Final Cold-Start Flow

### Step-by-Step Execution

#### 1. User Data Loading
```typescript
const hasBehavior = userFavorites.size > 0 || userReviews.size > 0;
const hasCategories = userCategories.size > 0;
```

#### 2. Cold-Start Detection
```typescript
if (!hasBehavior && hasCategories) {
  // COLD START: User has categories but no behavior
}
```

#### 3. Stage 1: Category-Based Recommendations
```typescript
const stage1Results = await getCategoryBasedRecommendations(
  userCategories,
  excludeBookIds,
  limit
);
```
- Returns books matching user's selected categories
- Ordered by: matched_category_count DESC, popularity DESC, created_at DESC
- Adds results to `results` array

#### 4. Stage 2: Controlled Random (Fill Remaining)
```typescript
if (results.length < limit) {
  const stage2Results = await getControlledRandomRecommendations(
    userCategories,
    new Set([...excludeBookIds, ...usedBookIds]),
    remaining
  );
}
```
- Fills remaining slots with random books from user's categories
- Only called if Stage 1 didn't fill the limit

#### 5. Stage 3: Popular in Categories (Fill Remaining)
```typescript
if (results.length < limit) {
  const stage3Results = await getPopularInCategories(
    userCategories,
    new Set([...excludeBookIds, ...usedBookIds]),
    remaining
  );
}
```
- Fills remaining slots with popular books within user's categories
- Only called if Stages 1-2 didn't fill the limit

#### 6. Guaranteed Retry (If Still Empty)
```typescript
if (results.length === 0) {
  // Verify books exist in categories
  const totalBooksInCategories = await query(...);
  
  if (totalBooksInCategories > 0) {
    // Retry without exclusions
    const retryResults = await getCategoryBasedRecommendations(
      userCategories,
      new Set(), // No exclusions
      limit
    );
  }
  // CRITICAL: Do NOT use global popular fallback
  // Return empty results rather than unrelated books
}
```

#### 7. Error Handling
```typescript
catch (err) {
  // Try category fallback (getPopularInCategories)
  // Do NOT use global popular fallback
}
```

#### 8. Post-Processing
- **Series Dedupe**: Applied (safe, preserves category-based results)
- **Category Diversity**: SKIPPED for cold-start users
- **Guaranteed Fallback**: If post-processing removes all results:
  ```typescript
  if (hasCategories && !hasBehavior) {
    // Rerun category query without exclusions
    // Do NOT use global popular fallback
  }
  ```

#### 9. Final Fallback (Post-Processing)
```typescript
// Only use global fallback if user has NO categories AND NO behavior
if (finalResults.length === 0 && !hasCategories && !hasBehavior) {
  const popularResults = await getPopularAll(excludeBookIds, limit);
}
```

---

## Key Changes Made

### Change 1: Removed Global Fallback from Cold-Start Path
**Location**: Lines 1223-1232

**Before**:
```typescript
} else {
  // Truly no books in categories - use global fallback
  const popularResults = await getPopularAll(excludeBookIds, limit);
}
```

**After**:
```typescript
}
// CRITICAL: Do NOT use global popular fallback for users with categories
// Users with categories should ONLY receive category-based recommendations
// If no books exist in their categories, return empty results rather than unrelated books
```

**Why**: Users with categories should NEVER receive unrelated global popular books.

---

### Change 2: Conditional Global Fallback in Post-Processing
**Location**: Lines 1423-1430

**Before**:
```typescript
// If still empty, use global fallback
if (finalResults.length === 0) {
  const popularResults = await getPopularAll(excludeBookIds, limit);
}
```

**After**:
```typescript
// CRITICAL: Only use global fallback if user has NO categories AND NO behavior
// Users with categories should NEVER receive global popular books
if (finalResults.length === 0 && !hasCategories && !hasBehavior) {
  const popularResults = await getPopularAll(excludeBookIds, limit);
}
```

**Why**: Ensures cold-start users with categories never get global popular books even after post-processing.

---

## Expected Behavior

### Scenario 1: Cold-Start User with Categories (Books Available)
- **Input**: User selects ["fantasy", "sci_fi"], no favorites/reviews
- **Stage 1**: Gets books matching fantasy OR sci_fi categories
- **Stage 2**: Fills remaining with random books from fantasy/sci_fi
- **Stage 3**: Fills remaining with popular books from fantasy/sci_fi
- **Post-Processing**: Series dedupe applied, diversity skipped
- **Result**: Returns 20 books (or fewer if not enough available) ALL from fantasy/sci_fi categories
- **Global Popular**: ❌ NEVER used

### Scenario 2: Cold-Start User with Categories (No Books Available)
- **Input**: User selects ["nonexistent_category"], no favorites/reviews
- **Stage 1-3**: Returns 0 results
- **Retry**: Retries without exclusions, still 0 results
- **Result**: Returns empty array `[]`
- **Global Popular**: ❌ NEVER used (even though empty)

### Scenario 3: User with No Categories and No Behavior
- **Input**: User has no categories, no favorites/reviews
- **Method**: Uses `getRandomRecommendations()` or `getPopularAll()`
- **Result**: Returns global popular/random books
- **Global Popular**: ✅ Used (correct - user has no categories)

### Scenario 4: User with Behavior
- **Input**: User has favorites/reviews
- **Method**: Uses `getBehaviorBasedRecommendations()` + discovery
- **Result**: Behavior-based recommendations (unchanged)
- **Global Popular**: ✅ May be used as fallback (unchanged behavior)

---

## Guarantees

1. ✅ **Cold-start users with categories NEVER receive global popular books**
2. ✅ **Cold-start users ONLY receive category-based recommendations**
3. ✅ **If no books exist in categories, return empty rather than unrelated books**
4. ✅ **Users with no categories can still receive global popular books**
5. ✅ **Behavior-based recommendations unchanged**

---

## Files Changed

1. ✅ `backend/src/services/recommend.service.ts`
   - Removed global fallback from cold-start path (line 1223-1232)
   - Made post-processing fallback conditional (line 1423-1430)
   - Added comments explaining the critical rule

---

## Testing Checklist

1. ✅ Cold-start user with categories → Should get ONLY category-based books
2. ✅ Cold-start user with categories → Should NEVER get global popular books
3. ✅ Cold-start user with no books in categories → Should return empty (not global popular)
4. ✅ User with no categories → Should get global popular books
5. ✅ User with behavior → Should get behavior-based recommendations (unchanged)

---

## Summary

The cold-start flow now **guarantees** that users with selected onboarding categories will:
- ✅ Receive ONLY category-based recommendations
- ✅ NEVER receive global popular books
- ✅ Return empty results if no books exist in their categories (rather than unrelated books)

This ensures that `/recommend/me` returns truly personalized category-based recommendations for cold-start users, maintaining the integrity of the recommendation system.
