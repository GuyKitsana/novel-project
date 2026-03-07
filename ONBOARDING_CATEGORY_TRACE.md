# Onboarding Category Saving Process - Complete Trace

## Flow Overview

```
Frontend → API Request → Validation → Controller → Database → Verification
```

## Step-by-Step Trace with Logging

### Step 1: Frontend - Category Selection & Submission
**File**: `frontend/app/onboarding/categories/page.tsx:178-190`

**What Happens**:
1. User selects categories (e.g., `['fantasy', 'romance']`)
2. `handleSubmit()` is called
3. Validates: `selected.length > 0 && selected.length <= 4`
4. Calls `apiPut("/onboarding/categories", { favoriteCategories: selected }, true)`

**Log to Check**:
```
[ONBOARDING FRONTEND] Step 1: Categories being sent to backend
```
- Should show: `favoriteCategories: ['fantasy', 'romance']`
- Should show: `count: 2`
- Should show: `userId: <number>`

**Verification**: ✅ Categories are in array format, count matches selection

---

### Step 2: Frontend API Layer - Request Preparation
**File**: `frontend/app/services/api.ts:45-78`

**What Happens**:
1. `apiPut()` calls `request()` with `method: "PUT"`, `body: { favoriteCategories: [...] }`
2. Sets `Content-Type: application/json`
3. Adds `Authorization: Bearer <token>` (auth=true)
4. Stringifies body: `JSON.stringify({ favoriteCategories: [...] })`
5. Sends `PUT /api/onboarding/categories` with JSON body

**Logs to Check**:
```
[ONBOARDING API] Step 1: Request payload being sent
[API request] PUT http://localhost:3001/api/onboarding/categories
```
- Should show: `body: { favoriteCategories: ['fantasy', 'romance'] }`
- Should show: `stringifiedBody: '{"favoriteCategories":["fantasy","romance"]}'`
- Should show: `hasAuth: true`

**Verification**: ✅ Payload contains `favoriteCategories` array

---

### Step 3: Backend Validation Middleware
**File**: `backend/src/middleware/validate.ts:13-28`

**What Happens**:
1. `validateBody(saveCategoriesSchema)` middleware runs
2. Receives `req.body` from Express (already parsed JSON)
3. Validates against Zod schema:
   ```typescript
   favoriteCategories: z.array(z.string().min(1)).min(1).max(4)
   ```
4. If valid, sets `req.body = parsedBody` and calls `next()`
5. If invalid, returns 400 error

**Logs to Check**:
```
[ONBOARDING VALIDATION] Step 1: Request body received (before validation)
[ONBOARDING VALIDATION] Step 2: Validation successful
```
- Should show: `rawBody: { favoriteCategories: ['fantasy', 'romance'] }`
- Should show: `parsedBody.favoriteCategories: ['fantasy', 'romance']`
- Should show: `favoriteCategoriesCount: 2`

**Verification**: ✅ Request body contains `favoriteCategories`, validation passes

---

### Step 4: Backend Controller - Receiving & Processing
**File**: `backend/src/controllers/onboarding.controller.ts:32-83`

**What Happens**:
1. Controller receives validated `req.body`
2. Extracts `{ favoriteCategories }` from `req.body`
3. Deletes existing categories: `DELETE FROM user_categories WHERE user_id = $1`
4. Loops through `favoriteCategories`:
   - For each code (e.g., 'fantasy'):
     - Query: `SELECT id FROM categories WHERE code = $1`
     - If found: `INSERT INTO user_categories (user_id, category_id) VALUES ($1, $2)`
     - If not found: Log warning, skip
5. Verifies stored categories with JOIN query
6. Returns success response

**Logs to Check**:
```
[ONBOARDING CONTROLLER] Step 1: Controller called
[ONBOARDING CONTROLLER] Step 2: Categories received (after validation)
[ONBOARDING CONTROLLER] Step 3: Delete completed
[ONBOARDING CONTROLLER] Step 4.1: Processing category code
[ONBOARDING CONTROLLER] Step 4.1: Category lookup result
[ONBOARDING CONTROLLER] Step 4.1: Insert successful
[ONBOARDING CONTROLLER] Step 5: Verification query result
[ONBOARDING CONTROLLER] Step 6: Final summary
```

**Key Checks**:
- Step 2: `favoriteCategories` array received
- Step 4.X: Each category code looked up and inserted
- Step 5: Verification shows rows in `user_categories` table
- Step 6: `storedCount > 0`

**Verification**: ✅ Categories are looked up, inserted, and verified

---

### Step 5: Database Operations
**File**: `backend/src/db/index.ts:43-45`

**What Happens**:
1. Each `query()` call uses PostgreSQL Pool
2. Pool auto-commits each query (no explicit transaction needed)
3. `DELETE` executes and commits
4. Each `INSERT` executes and commits immediately

**Potential Issues**:
- ❌ Category codes don't exist in `categories` table
- ❌ Database connection fails
- ❌ INSERT fails due to constraint violation
- ❌ Transaction rollback (unlikely with Pool, but possible)

**Logs to Check**:
- Look for `Insert successful` with `rowCount: 1`
- Look for `Category code not found` warnings
- Look for `Insert failed` errors

**Verification**: ✅ Each INSERT shows `rowCount: 1`

---

### Step 6: Verification Query
**File**: `backend/src/controllers/onboarding.controller.ts:75-95`

**What Happens**:
1. After all inserts, queries back:
   ```sql
   SELECT uc.category_id, c.code, c.name 
   FROM user_categories uc 
   JOIN categories c ON uc.category_id = c.id 
   WHERE uc.user_id = $1
   ```
2. Logs what was actually stored

**Logs to Check**:
```
[ONBOARDING CONTROLLER] Step 5: Verification query result
```
- Should show: `rowsFound: 2` (or number of categories selected)
- Should show: `storedCategories` array with category IDs and codes

**Verification**: ✅ Verification query returns expected number of rows

---

## Potential Root Causes

### Issue 1: Category Codes Don't Exist
**Symptom**: `Category code not found` warnings
**Check**: Verify `categories` table has rows with matching `code` values
**Fix**: Ensure category codes match exactly (case-sensitive)

### Issue 2: Database Connection Issue
**Symptom**: Query errors, connection failures
**Check**: Database logs, connection pool status
**Fix**: Check `DATABASE_URL` environment variable

### Issue 3: INSERT Fails Silently
**Symptom**: No error but `storedCount: 0`
**Check**: Look for `Insert failed` logs
**Fix**: Check for constraint violations, foreign key issues

### Issue 4: Transaction Rollback
**Symptom**: INSERT succeeds but verification shows 0 rows
**Check**: Database transaction logs
**Fix**: Unlikely with Pool, but check for explicit transactions

### Issue 5: User ID Mismatch
**Symptom**: Categories stored for wrong user
**Check**: `userId` in logs matches actual user
**Fix**: Verify `req.user.id` is correct

## How to Debug

1. **Run the application** and select categories during onboarding
2. **Check browser console** for `[ONBOARDING FRONTEND]` logs
3. **Check backend console** for `[ONBOARDING API]`, `[ONBOARDING VALIDATION]`, `[ONBOARDING CONTROLLER]` logs
4. **Follow the step numbers** to see where the flow breaks
5. **Compare logs** between successful and failed cases

## Expected Log Sequence

```
[ONBOARDING FRONTEND] Step 1: Categories being sent to backend
[ONBOARDING API] Step 1: Request payload being sent
[ONBOARDING VALIDATION] Step 1: Request body received (before validation)
[ONBOARDING VALIDATION] Step 2: Validation successful
[ONBOARDING CONTROLLER] Step 1: Controller called
[ONBOARDING CONTROLLER] Step 2: Categories received (after validation)
[ONBOARDING CONTROLLER] Step 3: Delete completed
[ONBOARDING CONTROLLER] Step 4.1: Processing category code
[ONBOARDING CONTROLLER] Step 4.1: Category lookup result
[ONBOARDING CONTROLLER] Step 4.1: Insert successful
[ONBOARDING CONTROLLER] Step 4.2: Processing category code
[ONBOARDING CONTROLLER] Step 4.2: Category lookup result
[ONBOARDING CONTROLLER] Step 4.2: Insert successful
[ONBOARDING CONTROLLER] Step 5: Verification query result
[ONBOARDING CONTROLLER] Step 6: Final summary
[ONBOARDING FRONTEND] Step 2: API call successful
```

## Files Modified

1. `frontend/app/onboarding/categories/page.tsx` - Added Step 1 & 2 logging
2. `frontend/app/services/api.ts` - Added Step 1 & 2 API logging
3. `backend/src/middleware/validate.ts` - Added Step 1 & 2 validation logging
4. `backend/src/controllers/onboarding.controller.ts` - Added Step 1-6 comprehensive logging

All logs include timestamps and step numbers for easy tracing.
