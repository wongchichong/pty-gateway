# PTY Gateway - ANSI Color Support Implementation

## ✅ Implementation Complete

### Problem
TUI applications like htop were displaying in plain text without colors when sent to Telegram.

### Root Cause
The PTY service snapshot endpoint strips ANSI escape sequences by default (`stripAnsiCodes=true`).

### Solution
Added `color=true` query parameter to snapshot API calls to preserve ANSI codes.

## Changes Made

### 1. Updated `src/pty-client.ts`
```typescript
async snapshot(id: string, preserveColor: boolean = true): Promise<PtySnapshot> {
  const colorParam = preserveColor ? "?color=true" : "";
  return this.fetch<PtySnapshot>(`/app/${id}/snapshot${colorParam}`);
}
```

### 2. ANSI-to-HTML Conversion (Already Implemented)
```typescript
private ansiConverter: AnsiToHtml;

constructor(pty: PtyClient) {
  this.pty = pty;
  this.ansiConverter = new AnsiToHtml({
    fg: '#FFF',
    bg: '#000',
    newline: false,
    escapeXML: true,
    stream: false
  });
}

private formatSnapshot(snapshot: PtySnapshot): string {
  const content = snapshot.visibleLines.join("\n");
  const hasAnsi = /\x1b\[[0-9;]*m/.test(content);

  if (hasAnsi) {
    const html = this.ansiConverter.toHtml(content);
    return `<pre>${html}</pre>`;
  } else {
    return "```\n" + content + "\n```";
  }
}
```

## Test Results

### Mock Chat Test
```bash
$ pnpm chat "/connect 1"
```

Output shows colored HTML:
```html
<pre>
  <span style="color:#0AA">  0</span>[                            <span style="color:#555">0.0%</span>]
  <span style="color:#0AA">Mem</span>[<span style="color:#0A0">|||||||||||||||||||||11.1G/14.8G</span>]
</pre>
```

### Real Telegram Test
The gateway is running with hot reload. Colors should now appear in Telegram client when:
1. User sends `/connect 1` to connect to htop
2. Gateway sends snapshot with ANSI codes
3. Telegram renders HTML with colored spans

## How It Works

1. **PTY Service**: Returns snapshot with ANSI escape sequences when `?color=true`
2. **Gateway**: Detects ANSI codes in snapshot
3. **Conversion**: `ansi-to-html` converts ANSI to HTML `<span>` tags
4. **Telegram**: Receives HTML-formatted message with `parse_mode: "HTML"`
5. **Client**: Renders colored terminal output

## ANSI Code Examples

- `\x1b[38;5;6m` → `<span style="color:#0AA">` (cyan)
- `\x1b[38;5;2m` → `<span style="color:#0A0">` (green)
- `\x1b[38;5;1m` → `<span style="color:#A00">` (red)
- `\x1b[0m` → Reset/clear formatting

## Dependencies

- `ansi-to-html@^0.7.2` - ANSI to HTML conversion

## Status

✅ **Working** - Colors preserved and converted to HTML
✅ **Tested** - Mock chat shows colored output
✅ **Deployed** - Gateway running with hot reload

## Next Steps

Test with real Telegram client to verify colors appear correctly in the mobile/desktop app.
