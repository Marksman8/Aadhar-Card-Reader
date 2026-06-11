# Aadhaar Registration Desk

A browser-based registration desk app that scans Aadhaar cards using Claude Vision AI
and auto-fills visitor details for registration.

## Project Structure

```
aadhaar-desk/
├── index.html        ← Main HTML (open this in browser)
├── css/
│   └── style.css     ← All styles
├── js/
│   └── app.js        ← All logic (camera, API, form, DB)
├── serve.py          ← One-click local server (camera support)
└── README.md
```

## How to Run

### Option 1 — Python server (recommended, enables camera)
```bash
python serve.py
# Opens at http://localhost:8080
```

### Option 2 — VS Code Live Server
Install the **Live Server** extension, right-click `index.html` → **Open with Live Server**.

### Option 3 — Just open the file
Double-click `index.html` to open in browser.
> ⚠️ Camera will NOT work on `file://`. Use options 1 or 2 for camera support.

## How it Works

1. Staff uploads or captures **front** and **back** of visitor's Aadhaar card
2. Click **Scan & Extract** — Claude Vision API reads all text from both images
3. Fields auto-fill: Name, DOB, Gender, Address, Pincode, Aadhaar (last 4 digits only)
4. Staff reviews, corrects if needed, clicks **Register Visitor**
5. Record saved to `localStorage` and shown in today's table

## API Key

The app calls `https://api.anthropic.com/v1/messages` directly from the browser.
You need to add your Anthropic API key.

Open `js/app.js` and find the `callClaude` function. Add your key to the headers:

```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': 'sk-ant-YOUR_KEY_HERE',        // ← add this
  'anthropic-version': '2023-06-01',            // ← add this
  'anthropic-dangerous-direct-browser-access': 'true'  // ← add this
},
```

> ⚠️ For production, never expose your API key in the browser. Route requests through
> a backend server (Flask / Node.js) that holds the key securely.

## Privacy

- Aadhaar number is **always masked** — only last 4 digits are stored (UIDAI guidelines)
- Images are never uploaded to any server — only the extracted text is sent to Claude API
- All records saved to browser `localStorage` only

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no build tools needed
- Claude Vision API (`claude-sonnet-4-20250514`) for OCR
- `localStorage` for data persistence
