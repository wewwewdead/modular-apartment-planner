# Fix: Reduce log noise from non-message WhatsApp events

## Context
After fixing the `.run()` → `.connect()` crash, the app now connects successfully. However, on every connection it logs 5-10 warning lines like:
```
WARNING | src.whatsapp.client:_parse_inbound_event:78 - Skipping event due to missing whatsapp_id or message_id
```
These are **not bugs** — neonize delivers `MessageEv` callbacks for history sync entries, protocol messages, and other non-user events that lack a normal sender/id. The current code correctly returns `None` and skips them. The only problem is unnecessary log noise that obscures real issues.

## Fix

### File: `src/whatsapp/client.py` (line 78)

Change the log level from `warning` to `debug` so these expected skip events don't clutter normal output:

```python
# Before
logger.warning("Skipping event due to missing whatsapp_id or message_id")

# After
logger.debug("Skipping event due to missing whatsapp_id or message_id")
```

Single-line change. The filtering logic itself is correct and should stay as-is.

## Verification
1. Run `python main.py start` — should connect without warning spam in the console.
2. Send a real WhatsApp message to the bot — should still be received and processed normally.
3. Set `LOG_LEVEL=DEBUG` to confirm the skip events are still logged at debug level if needed for troubleshooting.
