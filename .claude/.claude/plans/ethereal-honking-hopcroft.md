# Fix `get_for_you_feed` persistent "structure mismatch" Error

## Context
The `get_for_you_feed` RPC keeps failing with `structure of query does not match function result type` even after fixing `prompt_id UUID→INTEGER`, `cached_like_count→cached_reaction_count`, `views BIGINT→INT`, and adding `::BIGINT` casts on cached count columns.

**Likely root cause:** Either (a) an old function overload with a different signature still exists in Supabase and PostgREST is calling it instead, or (b) some column types in the actual DB (VARCHAR vs TEXT, etc.) don't match the RETURNS TABLE declaration, and plpgsql's `RETURN QUERY` is strict about it.

## Fix — `server/sql/personalized_feed.sql`

### 1. Nuclear DROP — remove ALL overloads
Replace the targeted `DROP FUNCTION IF EXISTS public.get_for_you_feed(UUID, INT, TIMESTAMPTZ)` with a broader drop that catches any stale overloads:

```sql
DO $$ BEGIN
    DROP FUNCTION IF EXISTS public.get_for_you_feed(UUID, INT, TIMESTAMPTZ);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
```

### 2. Simplify RETURNS TABLE types to match raw column types exactly
Instead of declaring `BIGINT` for cached counts (which are `INT` columns) and relying on casts, declare them as `INT` to match the actual column types. This eliminates any cast ambiguity in plpgsql's `RETURN QUERY`:

```
RETURNS TABLE (
    ...
    views INT,          -- already fixed
    prompt_id INTEGER,  -- already fixed
    like_count INT,     -- was BIGINT, change to INT (cached_reaction_count is INT)
    reaction_count INT, -- was BIGINT, change to INT
    comment_count INT,  -- was BIGINT, change to INT
    bookmark_count INT, -- was BIGINT, change to INT
    ...
)
```

And remove the `::BIGINT` casts from the CTE (lines 109-112), back to plain column references.

### 3. Explicitly cast every text column to TEXT
Add `::TEXT` casts on columns that might be VARCHAR in the actual DB:
- `j.title::TEXT`
- `j.post_type::TEXT`
- `j.privacy::TEXT`
- `j.repost_caption::TEXT`
- `u.name::TEXT AS user_name`
- `u.image_url::TEXT AS user_image_url`
- `u.badge::TEXT AS user_badge`

### 4. Apply same fixes to `get_interest_posts`
Same pattern: INT for counts, `::TEXT` casts on string columns, remove `::BIGINT` casts.

### 5. Update `getService.js` row mapping if needed
Check if the JS code that maps RPC rows depends on BIGINT behavior — it shouldn't since `Number()` handles both INT and BIGINT the same way.

## Files to modify
- `server/sql/personalized_feed.sql` — both `get_for_you_feed` and `get_interest_posts`

## Deploy
- Re-run the full updated `personalized_feed.sql` in the Supabase SQL editor

## Verification
- For You feed endpoint should return data without 500 error
- Interest-based explore should also work
