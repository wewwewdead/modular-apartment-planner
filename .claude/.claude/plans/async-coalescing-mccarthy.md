# Fix: reading_time showing "1 min" for all posts

## Context
Posts on the Explore page always show "1 min read" because the `reading_time` database column was added with `DEFAULT 1`. New posts get correct values at write time, but existing posts were never backfilled.

## Plan
Run the existing backfill script to update all journals with correct reading times:

```
node --env-file=.env server/scripts/backfillReadingTime.js
```

**Script:** `server/scripts/backfillReadingTime.js`
- Processes all journals in batches of 100
- Parses full `content` JSON to extract text
- Computes reading time at 150 WPM
- Updates the `reading_time` column

No code changes needed — the frontend and backend code already handle `reading_time` correctly.

## Verification
- After running, spot-check a few posts in the DB to confirm `reading_time > 1` for longer posts
- Reload the Explore page and verify reading times display correctly
