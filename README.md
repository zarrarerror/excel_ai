# Shayntech AI Agent for Excel

> Your agentic AI co-pilot for Microsoft Excel.
> Reads your workbook, understands your data, and takes action autonomously.

---

## What It Does

This is a fully agentic Excel Add-in. It doesn't just answer questions — it **acts**:

- Reads your entire workbook (all sheets, values, formulas)
- Understands natural language commands
- Executes multi-step plans: write data, set formulas, format cells, create charts, add sheets, sort data
- Reads attached files: PDF, CSV, XLSX, TXT, JSON — and works with their content in Excel
- Supports 3 AI providers: **OpenRouter** (free), **Qwen/Alibaba** (free), **Ollama** (local/free)

---

## Files Included

```
ExcelAIAgent/
├── manifest.xml      ← Install this into Excel
├── taskpane.html     ← Host this on a web server
└── README.md         ← This file
```

---

## STEP 1 — Host taskpane.html

The add-in needs `taskpane.html` to be accessible via HTTPS (or HTTP for local dev).

### Option A — GitHub Pages (Free, Recommended)
1. Create a GitHub repository (public)
2. Upload `taskpane.html` to the repo
3. Go to repo Settings → Pages → Source: Deploy from branch → main → / (root)
4. Your URL will be: `https://YOUR_USERNAME.github.io/YOUR_REPO/taskpane.html`

### Option B — Netlify (Free, Instant)
1. Go to https://netlify.com → Log in
2. Drag and drop the `taskpane.html` file onto the Netlify dashboard
3. Copy the URL it gives you (e.g. `https://random-name.netlify.app/taskpane.html`)

### Option C — Local development (for testing only)
```bash
# Install Node.js, then run:
npx serve .
# This serves the current folder at http://localhost:3000
# NOTE: Excel Desktop may accept localhost for sideloading during dev
```

---

## STEP 2 — Update manifest.xml

Open `manifest.xml` in a text editor. Find **both** places that say:

```
https://YOUR_HOSTED_URL/taskpane.html
```

Replace them with your actual URL from Step 1. There are exactly 2 places:
- `<SourceLocation DefaultValue="..."/>`  (inside `<DefaultSettings>`)
- `<bt:Url id="Taskpane.Url" DefaultValue="..."/>` (inside `<Resources>`)

Save the file.

---

## STEP 3 — Install in Excel

### Excel Desktop (Windows or Mac)
1. Open Excel
2. Click **Insert** in the ribbon
3. Click **Add-ins** → **My Add-ins** (or "Get Add-ins")
4. Click **Upload My Add-in** (or "Manage My Add-ins" → Upload)
5. Browse to and select your `manifest.xml` file
6. Click **Upload**
7. A new button **"Open AI Agent"** will appear in the **Home** tab ribbon

### Excel on the Web (office.com)
1. Open any workbook on https://excel.office.com
2. Click **Insert** → **Add-ins** → **Upload My Add-in**
3. Select your `manifest.xml`
4. The panel will appear in the sidebar

---

## STEP 4 — Configure AI Provider

Click **"Open AI Agent"** in the ribbon to open the panel. Go to the **Settings** tab.

### Option A: OpenRouter (Free models available)
1. Sign up at https://openrouter.ai
2. Go to Account → API Keys → Create Key
3. Paste your key (starts with `sk-or-v1-`) in the OpenRouter section
4. Choose a free model — recommended: **Mistral 7B Instruct (Free)**
5. Click **Save Settings** → **Test Connection**

### Option B: Qwen / Alibaba DashScope (Free quota)
1. Sign up at https://dashscope.aliyun.com
2. Go to API Keys section → Create API Key
3. Paste your key (starts with `sk-`) in the Qwen section
4. Choose **qwen-turbo** for the free tier
5. Click **Save Settings** → **Test Connection**

### Option C: Ollama (100% Free, Local)
1. Download Ollama from https://ollama.com
2. Install and run it (it starts automatically as a background service)
3. Open a terminal and run:
   ```bash
   ollama pull llama3.2
   ```
   Or any other model: `mistral`, `codellama`, `qwen2.5`, `phi3`
4. In Settings, set URL to `http://localhost:11434` and model to `llama3.2`
5. Click **Save Settings** → **Test Connection**

**Ollama on a remote/cloud server:**
- Set the URL to your server IP, e.g. `http://192.168.1.100:11434`
- Make sure the Ollama server is running with `OLLAMA_HOST=0.0.0.0 ollama serve`

---

## STEP 5 — Use the Agent

Go to the **Chat** tab and start typing commands.

### Example Commands

**Data work:**
```
Summarize the sales data in Sheet1 and add a TOTAL row at the bottom
```
```
In column C, add a formula to calculate profit margin from column A (revenue) and column B (cost)
```
```
Fill column D with sequential dates starting from today, one per row, for 30 rows
```

**Formatting:**
```
Format row 1 as a header: bold, white text, dark blue background
```
```
Format all numbers in column C as currency with 2 decimal places
```
```
Add borders to the table in A1:E20 and auto-fit all columns
```

**Charts:**
```
Create a bar chart from the data in A1:B10 and place it next to the table starting at D2
```
```
Make a pie chart showing the distribution of values in column B
```

**Sheet management:**
```
Add a new sheet called "Summary" and write the key totals from Sheet1 there
```
```
Rename Sheet1 to "Sales Data" and Sheet2 to "Analysis"
```

**File operations:**
```
[Attach a CSV file first] Read the attached CSV and paste it into Sheet2 starting at A1
```
```
[Attach a PDF] Extract the table from this PDF and put it in Sheet3
```

**Complex multi-step:**
```
Create a complete sales dashboard: read Sheet1 data, calculate totals and averages, 
format the headers, add a summary table in Sheet2, and create a column chart
```

### Attaching Files
1. Click the 📎 button next to the input box
2. Select your file (PDF, CSV, XLSX, TXT, JSON)
3. The file name appears above the input
4. Type your command and hit Send
5. The agent reads the file and uses it in Excel

---

## Agent Settings

| Setting | Description |
|---|---|
| Max iterations | How many actions the agent can take in one run (default: 10) |
| Context rows limit | Max rows sent to AI per sheet (default: 100 — increase for large data) |

---

## Troubleshooting

**"Please configure your AI provider first"**
→ Go to Settings, fill in your API key, click Save Settings.

**"OpenRouter error 401"**
→ Your API key is wrong or expired. Get a new one at openrouter.ai.

**"Ollama error 404 / connection refused"**
→ Ollama is not running. Start it by opening the Ollama app, or run `ollama serve` in a terminal.
→ If using a remote server, make sure the IP and port are correct.

**"Could not read workbook"**
→ The workbook might be in Protected Mode. Click "Enable Editing" in the yellow bar at the top.

**Agent stops mid-task**
→ Increase the "Max iterations" in Settings.
→ The free AI models have shorter context windows — try breaking your task into smaller steps.

**Excel Web shows HTTPS error**
→ Your taskpane.html must be hosted on HTTPS for Excel Web. Use GitHub Pages or Netlify (both free HTTPS).

---

## Privacy & Security

- Your API key is stored **only in your browser's localStorage** on your own machine.
- The agent sends your workbook data to the AI API you configured. Use a private/local Ollama instance if data privacy is critical.
- No data is ever sent to Shayntech servers.

---

## Built by Shayntech

https://shayntech.com

Version 1.0.0
