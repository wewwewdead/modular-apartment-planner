# Gilas — Intent Dispatcher & Modular Services

## Context
Transform Gilas from a simple `/`-prefix chatbot into a modular, intent-driven AI teacher assistant. The bot should understand natural language (no prefix needed), classify user intent via Ollama, and route to specialized service modules. Persona shifts from Taglish to professional English (Executive Assistant tone).

## Target File Structure
```
gilas/
  .env                          # MODIFY — add portal/twitter vars
  .gitignore                    # UNCHANGED
  config.js                     # MODIFY — English persona, classifier prompt, new config sections
  index.js                      # MODIFY — intent dispatcher, document handling, service routing
  services/
    automation.js               # DELETE (replaced by automationEngine.js)
    automationEngine.js         # CREATE — runGrading stub + summarizeTwitter (Puppeteer)
    fileProcessor.js            # CREATE — CSV/XLSX → JSON via xlsx library
    academicService.js          # CREATE — stateless educational Q&A via Ollama
  package.json                  # MODIFIED (by npm install xlsx)
```

---

## Step 1: Install `xlsx`

```bash
npm install xlsx
```

(ollama, puppeteer, dotenv already installed)

---

## Step 2: Update `.env`

Add portal and Twitter credentials below existing vars:

```env
OLLAMA_MODEL=llama3.2
OLLAMA_HOST=http://127.0.0.1:11434
PORTAL_URL=https://portal.example.com
TWITTER_USERNAME=
TWITTER_PASSWORD=
```

---

## Step 3: Rewrite `config.js`

Keep `import 'dotenv/config'` and `config.ollama` section. Add:

- `config.portal.url` — from `PORTAL_URL` env var
- `config.twitter.username` / `config.twitter.password` — from env vars
- Replace `SYSTEM_PROMPT` — professional English, executive assistant tone, no Tagalog, plain text for WhatsApp
- Add `CLASSIFIER_PROMPT` export — instructs Ollama to classify intent

**CLASSIFIER_PROMPT design** (critical for 3B model reliability):
```
You are an intent classifier. Given a user message, reply with EXACTLY one word — the intent key.

Available intents:
- ENCODE_DATA: The user wants to process, encode, or extract data from a file (CSV, Excel, spreadsheet).
- SUMMARIZE_TWITTER: The user wants a summary of Twitter/X posts or trending topics.
- ANSWER_ASSIGNMENT: The user asks an academic or educational question (explain a concept, help with homework, lesson planning).
- CHAT: General conversation, greetings, or anything that doesn't fit the above.

If a file is attached, lean toward ENCODE_DATA.

Reply with only the intent key, nothing else.

User message: "{MESSAGE}"
```

The `{MESSAGE}` placeholder gets replaced at runtime. Single-word output is the most reliable format for a 3B model.

---

## Step 4: Create `services/fileProcessor.js`

**Export:** `parseDocument(buffer, mimetype, filename)`

Logic:
1. Determine format from mimetype (`application/vnd.openxmlformats...` → xlsx, `text/csv` → csv, also check filename extension as fallback)
2. Use `xlsx.read(buffer, { type: 'buffer' })` to parse (xlsx handles both formats)
3. Take the first sheet: `workbook.SheetNames[0]`
4. Convert to JSON: `xlsx.utils.sheet_to_json(sheet)`
5. Return `{ success: true, data, sheetName, rowCount }`
6. On error: return `{ success: false, message: '...' }`

---

## Step 5: Create `services/automationEngine.js`

**Export:** `runGrading({ data })` and `summarizeTwitter()`

### `runGrading({ data })`
- Stub — returns `{ success: false, message: 'Grade encoding is not yet configured. Please set PORTAL_URL in the environment.' }`
- Placeholder for future Puppeteer portal automation

### `summarizeTwitter()`
- Import puppeteer and config
- Launch headless browser
- Navigate to Twitter/X login page
- Fill username → click next → fill password → click login
- Wait for home timeline to load
- Scrape first 5 tweet text elements via `page.$$eval`
- Close browser, return formatted string of tweets
- On error (missing credentials, login failure, timeout): return descriptive error message
- Note: Twitter's anti-bot protections may require adjustments (cookies, user-agent, etc.)

---

## Step 6: Create `services/academicService.js`

**Export:** `answerAssignment(ollamaClient, model, prompt)`

- Takes the shared Ollama client instance + model name (avoids creating duplicate clients)
- Sends a single stateless request — NO chat history (each question is independent)
- Uses its own system prompt: "You are an academic tutor. Provide clear, structured, educational explanations. Use plain text formatting suitable for WhatsApp."
- Calls `ollama.chat()` with just `[system, user]` messages
- Returns the response text
- On error: returns user-friendly error string

---

## Step 7: Rewrite `index.js`

### New imports
```js
import { Ollama } from 'ollama'
import { config, SYSTEM_PROMPT, CLASSIFIER_PROMPT } from './config.js'
import { parseDocument } from './services/fileProcessor.js'
import { runGrading, summarizeTwitter } from './services/automationEngine.js'
import { answerAssignment } from './services/academicService.js'
```

### `classifyIntent(text, hasDocument)` function
1. Replace `{MESSAGE}` in CLASSIFIER_PROMPT with the user's text
2. If `hasDocument`, append " [FILE ATTACHED]" to the message
3. Call `ollama.chat()` with the classifier prompt as a single user message (no system prompt, no history)
4. Parse response: `.trim().toUpperCase()`, validate against known intents
5. Default to `'CHAT'` if response doesn't match any known intent
6. Log: `[jid] intent: INTENT_KEY`

### Message extraction (expanded)
```js
// Text from regular or extended messages
const text = msg.message?.conversation
  || msg.message?.extendedTextMessage?.text
  || ''

// Document detection
const docMsg = msg.message?.documentMessage
  || msg.message?.documentWithCaptionMessage?.message?.documentMessage
const docCaption = docMsg?.caption || ''
const hasDocument = !!docMsg
const userText = text || docCaption  // caption serves as text for documents
```

### Message flow
1. Skip if no `userText` AND no document
2. `/clear` — hardcoded, same as before (but English: "Conversation cleared.")
3. Show typing: `sendPresenceUpdate('composing', jid)`
4. Classify intent: `const intent = await classifyIntent(userText, hasDocument)`
5. Route:

| Intent | Action |
|--------|--------|
| `ENCODE_DATA` | Download doc buffer via `downloadMediaMessage(msg)`, call `parseDocument(buffer, mimetype, filename)`, send formatted result |
| `SUMMARIZE_TWITTER` | Call `summarizeTwitter()`, send result |
| `ANSWER_ASSIGNMENT` | Call `answerAssignment(ollama, config.ollama.model, userText)`, send result |
| `CHAT` | Call `chatWithOllama(jid, userText)` (existing function with history), send result |

6. Stop typing: `sendPresenceUpdate('paused', jid)`
7. Catch errors → send professional English error message

### Preserved
- `chatHistories` Map with 50-message rolling window (used only by CHAT intent)
- `chatWithOllama()` function (unchanged logic, new SYSTEM_PROMPT from config)
- Baileys auth (`auth_info`), reconnection, QR code display
- Self-message processing (no `fromMe` filter)
- Console logging: `[jid] > message`, `[jid] intent: KEY`, `[jid] < response`

### Removed
- `/` prefix requirement (all messages processed)
- Old `services/automation.js` (replaced by `automationEngine.js`)

---

## Step 8: Delete `services/automation.js`

The old stub is replaced by `automationEngine.js`.

---

## Files Summary

| File | Action |
|------|--------|
| `.env` | **MODIFY** — add 3 vars |
| `config.js` | **MODIFY** — full rewrite |
| `index.js` | **MODIFY** — full rewrite |
| `services/fileProcessor.js` | **CREATE** |
| `services/automationEngine.js` | **CREATE** |
| `services/academicService.js` | **CREATE** |
| `services/automation.js` | **DELETE** |

---

## Verification
1. `npm install xlsx` — no errors
2. `node index.js` — prints "Gilas connected to WhatsApp!"
3. Send "Hello" → intent classified as CHAT → professional English response
4. Send "Explain photosynthesis" → ANSWER_ASSIGNMENT → structured educational answer
5. Send "What's trending on Twitter?" → SUMMARIZE_TWITTER → attempts scrape (or returns config error if creds empty)
6. Send a .xlsx file + "Encode this" → ENCODE_DATA → returns parsed JSON summary
7. Send "/clear" → "Conversation cleared."
8. Check terminal logs show intent classification for each message
