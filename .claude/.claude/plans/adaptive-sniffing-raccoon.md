# Fix: Remove Ollama timeout + Fix reply delivery in single-number mode

## Context
Two separate issues are preventing the user from receiving replies:

1. **Ollama timeout** — The LLM request timeout is hardcoded at 30s (`config.js:46`). The model takes longer, causing 2 retries to fail, and the bot falls back to a generic "I could not determine the exact action" message instead of the actual AI reply.

2. **Reply delivery** — In single-number mode (user IS the bot's WhatsApp account), the bot sends to the user's own LID (`99905888624837@lid`). The echo is observed immediately (verified=true), so the phone JID fallback (`639497868448@s.whatsapp.net`) is never tried. But LID targets may not produce visible messages in WhatsApp's UI. Neither target alone is reliable, so we need to try **both**.

Even "hello" (which matches rule-based intent and skips Ollama entirely) produces no visible reply — confirming the delivery issue is independent of the timeout.

## Changes

### 1. `src/config.js` — Remove hardcoded Ollama timeout
- Change `requestTimeoutMs: 30000` → `requestTimeoutMs: parseInteger(process.env.OLLAMA_TIMEOUT_MS, 0)`
- `0` means no timeout (axios treats 0 as infinite)
- Set retries to 0 by default since timeout failures won't be the norm: `retries: parseInteger(process.env.OLLAMA_RETRIES, 0)`

### 2. `src/tools/ollama-http.js` — Handle timeout=0 correctly
- Change `{ timeout: timeoutMs }` → `{ timeout: timeoutMs || undefined }`
- When `timeoutMs` is 0/falsy, axios uses no timeout (waits indefinitely)

### 3. `src/whatsapp/reply-router.js` — Broadcast to all targets
Revert primary back to phone JID (standard for self-messaging) and add `broadcastAll: true` flag so ALL targets are tried regardless of echo verification:

```js
if (incomingIsLid && mePhoneJid) {
  return {
    primary: mePhoneJid,
    fallbacks: unique([primary, meLidJid].filter((j) => j && j !== mePhoneJid)),
    strategy,
    reason: "lid_broadcast_all",
    broadcastAll: true,
  };
}
```

### 4. `src/whatsapp/handler.js` — Support broadcastAll mode
In `sendReplyWithRouting`, when `routing.broadcastAll` is true, skip echo verification and send to every target:

```js
// Inside the for loop, after successful send attempt:
if (routing.broadcastAll) {
  lastSuccess = { ...attempt, usedFallback: i > 0, verified: true };
  continue; // try next target too
}
// ... existing verification logic unchanged for non-broadcast ...
```

After the loop, mark complete if any target succeeded.

## Files to modify
1. `C:\Users\johnm\teacher-gradebot\src\config.js` (line 46-47)
2. `C:\Users\johnm\teacher-gradebot\src\tools\ollama-http.js` (line 39, 47)
3. `C:\Users\johnm\teacher-gradebot\src\whatsapp\reply-router.js` (lines 49-56)
4. `C:\Users\johnm\teacher-gradebot\src\whatsapp\handler.js` (lines 406-432)

## Verification
1. Restart the bot
2. Send "hello" → should receive the help message on WhatsApp
3. Send "who is the founder of SpaceX?" → bot should wait for full LLM response (no timeout), then reply
4. Check logs: `reason=lid_broadcast_all`, both targets attempted, no timeout warnings
