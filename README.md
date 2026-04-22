# YAML Builder

A React + Vite app for composing Midscene AI test files with a visual editor and live YAML preview.

## What It Does

- Build test tasks and steps through a UI instead of hand-writing YAML
- Preview generated YAML in real time
- Reorder tasks and steps with drag-and-drop
- Insert tasks/steps between existing items
- Add optional XPath hints to AI steps
- Copy YAML to clipboard or download as a `.yaml` file
- Use a bookmarklet-based XPath picker while developing locally

## Current Feature Set

### Test Configuration

The app generates YAML with:

- `web.url` (editable)
- `web.viewportWidth` (currently fixed to `1280` in app state)
- `web.viewportHeight` (currently fixed to `800` in app state)
- `agent.groupName` (editable)
- `agent.generateReport` (currently fixed to `true`)

### Browser Option

You can toggle:

- `--deny-permission-prompts`

When enabled, it adds this to YAML:

```yaml
web:
  chromeArgs:
    - --deny-permission-prompts
```

### Project Description Requirement

A project description is required before download:

- Minimum 100 characters
- Added as a top YAML comment: `# Description: ...`
- Download button is blocked until valid

Copy to clipboard still works from the preview panel.

### Task and Step Editing

- Multiple tasks supported
- Each task can contain a flow of steps
- Drag handles allow reordering tasks and steps
- Hover separators allow inserting tasks/steps at specific positions

Supported step types:

- `aiTap`
- `aiInput`
- `aiKeyboardPress`
- `aiAssert`
- `aiQuery`
- `aiWaitFor`
- `sleep`
- `javascript`

Field behavior:

- AI steps (`ai*`) support `instruction` and optional `xpath`
- `aiInput` also supports `value`
- `aiKeyboardPress` maps `value` to `keyName`
- `aiWaitFor` maps `value` to numeric `timeout`
- `sleep` maps numeric `value` to `sleep`
- `javascript` maps `value` to `javascript`

## XPath Picker Flow (Dev)

The bookmarklet flow currently works through a relay page and localStorage:

1. Drag **Pick XPath** from the app into your bookmarks bar
2. Open your target site and click the bookmarklet
3. Click an element to capture XPath
4. Bookmarklet opens `public/xpath-relay.html` with XPath in query params
5. Relay page writes `pending_xpath` to localStorage on the YAML Builder origin
6. The app receives the storage event and applies XPath to the selected step

If no step is selected, XPath is stored as pending and applied once a step is selected.

## Dev Middleware Compatibility

`vite.config.js` also includes a custom dev middleware:

- `POST /api/xpath`
- broadcasts `xpath:received` via Vite WebSocket
- includes CORS + Private Network Access headers

The app listens for that HMR custom event too, so both relay-based and middleware-based XPath delivery are supported in development.

## Project Structure

```txt
yaml builder/
|-- index.html
|-- package.json
|-- vite.config.js
|-- eslint.config.js
|-- README.md
|-- public/
|   |-- favicon.svg
|   |-- icons.svg
|   `-- xpath-relay.html
`-- src/
    |-- App.css
    |-- App.jsx
    |-- index.css
    |-- main.jsx
    `-- assets/
        |-- hero.png
        |-- react.svg
        `-- vite.svg
```

## Tech Stack

Runtime dependencies:

- `react`
- `react-dom`
- `js-yaml`
- `lucide-react`

Build/dev dependencies:

- `vite`
- `@vitejs/plugin-react`
- `eslint`
- `@eslint/js`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `globals`

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

Default URL:

- `http://localhost:5173`

### Other Scripts

```bash
npm run build
npm run preview
npm run lint
```

## Production Notes

`npm run build` outputs static files to `dist/`.

Important limitations in production builds:

- Vite dev middleware (`/api/xpath`) is unavailable
- `import.meta.hot` event channel is unavailable
- Bookmarklet relay flow tied to local dev origin will not behave like dev authoring flow

Core YAML editing, preview, copy, and download continue to work.