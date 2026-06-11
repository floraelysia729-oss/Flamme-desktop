---
title: Flamme Editor - Markdown Showcase
author: Flamme
date: 2026-06-01
tags: [markdown, editor, showcase]
---

# Flamme Editor

A modern Markdown editor built with CodeMirror 6, featuring real-time preview, syntax highlighting, and keyboard shortcuts.

---

## Text Formatting

This is a paragraph with **bold text**, *italic text*, and ***bold italic*** combined. You can also use ~~strikethrough~~ text and `inline code` within sentences.

> "The best way to predict the future is to invent it."
> -- Alan Kay

### Nested Formatting

You can combine **bold with `code`** inside, or *italic with **nested bold** inside*. Here's a [hyperlink to GitHub](https://github.com) and an auto-link: <https://example.com>.

---

## Headings

# H1 Heading

## H2 Heading

### H3 Heading

#### H4 Heading

##### H5 Heading

###### H6 Heading

---

## Lists

### Unordered List

- First item with some text
- Second item with **bold**
  - Nested item A
  - Nested item B
    - Deep nested item
- Third item
  - Another nested item

### Ordered List

1. Step one: Initialize the project
2. Step two: Install dependencies
3. Step three: Configure the editor
   1. Set up theme
   2. Add keymaps
   3. Enable extensions
4. Step four: Build and test

### Task List

- [x] Create project scaffold
- [x] Set up CodeMirror 6
- [x] Add Markdown highlighting
- [x] Implement keyboard shortcuts
- [x] Add side-by-side preview
- [ ] File open/save support
- [ ] Performance optimization

---

## Code Blocks

### JavaScript

```javascript
class MarkdownEditor {
  constructor(container, options = {}) {
    this.container = container
    this.theme = options.theme || 'dark'
    this.plugins = options.plugins || []
    this.view = null
  }

  async init() {
    const state = EditorState.create({
      doc: this.getInitialContent(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        ...this.plugins,
      ],
    })
    this.view = new EditorView({
      state,
      parent: this.container,
    })
  }

  getInitialContent() {
    return '# Hello World\n\nStart editing...'
  }

  getContent() {
    return this.view.state.doc.toString()
  }

  destroy() {
    this.view?.destroy()
  }
}
```

### TypeScript

```typescript
interface EditorConfig {
  theme: 'light' | 'dark'
  fontSize: number
  lineWrapping: boolean
  extensions: Extension[]
}

function createEditor(config: EditorConfig): EditorView {
  const { theme, fontSize, lineWrapping, extensions } = config
  // ... implementation
  return new EditorView({ /* ... */ })
}
```

### Python

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class MarkdownToken:
    type: str
    content: str
    line: int
    column: int
    children: Optional[list['MarkdownToken']] = None

def tokenize(source: str) -> list[MarkdownToken]:
    tokens = []
    for i, line in enumerate(source.split('\n'), 1):
        if line.startswith('#'):
            level = len(line.split(' ')[0])
            tokens.append(MarkdownToken(
                type='heading',
                content=line.lstrip('# '),
                line=i,
                column=0,
            ))
    return tokens
```

### Rust

```rust
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct MarkdownNode {
    node_type: String,
    children: Vec<MarkdownNode>,
    attributes: HashMap<String, String>,
}

impl MarkdownNode {
    fn new(node_type: &str) -> Self {
        MarkdownNode {
            node_type: node_type.to_string(),
            children: Vec::new(),
            attributes: HashMap::new(),
        }
    }

    fn add_child(&mut self, child: MarkdownNode) {
        self.children.push(child);
    }
}
```

### CSS

```css
.cm-editor {
  height: 100%;
  font-size: 14px;
}

.cm-editor .cm-content {
  font-family: 'Fira Code', monospace;
  caret-color: #89b4fa;
}

.cm-editor .cm-gutters {
  background: #181825;
  color: #a6adc8;
  border-right: 1px solid #313244;
}

.cm-editor .cm-activeLineGutter {
  background: #1e1e2e;
}

.cm-editor .cm-activeLine {
  background: rgba(137, 180, 250, 0.05);
}
```

### Shell

```bash
#!/bin/bash
set -euo pipefail

PROJECT_NAME="flamme-editor"

echo "Setting up ${PROJECT_NAME}..."

npm init -y
npm install codemirror @codemirror/lang-markdown
npm install -D typescript vite vitest

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
EOF

echo "Done! Run 'npm run dev' to start."
```

### JSON

```json
{
  "name": "cm6-prototype",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@codemirror/view": "^6.43.0",
    "@codemirror/state": "^6.6.0",
    "@codemirror/lang-markdown": "^6.5.0"
  }
}
```

---

## Tables

### Feature Comparison

| Feature | CM6 | Monaco | Ace | CodeMirror 5 |
|---------|-----|--------|-----|-------------|
| Bundle Size | Small | Large | Medium | Medium |
| Performance | Excellent | Good | Good | Fair |
| Extensibility | Great | Good | Good | Good |
| TypeScript | Native | Native | Yes | No |
| Mobile Support | Yes | No | Limited | Yes |

### Project Timeline

| Phase | Task | Status | Duration |
|-------|------|--------|----------|
| 1 | Project scaffold | Complete | 1 day |
| 2 | CM6 core editor | Complete | 2 days |
| 3 | Markdown shortcuts | Complete | 1 day |
| 4 | Side-by-side preview | Complete | 2 days |
| 5 | File I/O | In Progress | 1 day |
| 6 | Performance tuning | Pending | 1 day |

---

## Blockquotes

> This is a simple blockquote.

> This is a longer blockquote that spans multiple lines.
> It demonstrates how text wraps within the quote block.
> The styling uses a left border accent.

> **Note:** This blockquote contains formatted text.
>
> It even has a second paragraph with `inline code`.
>
> And a list:
> - Item one
> - Item two

### Nested Blockquotes

> Outer quote
>
> > Inner quote with **bold text**
> >
> > And a code reference: `EditorView`

---

## Links and Images

### Links

- [GitHub](https://github.com)
- [CodeMirror 6 Docs](https://codemirror.net/docs/)
- [Markdown Guide](https://www.markdownguide.org/)
- [MDN Web Docs](https://developer.mozilla.org/)

### Auto-links

<https://codemirror.net>

<contact@example.com>

---

## Horizontal Rules

Above this line.

---

Below this line.

---

## Special Characters

| Symbol | Name | HTML Entity |
|--------|------|-------------|
| & | Ampersand | `&amp;` |
| < | Less than | `&lt;` |
| > | Greater than | `&gt;` |
| " | Quote | `&quot;` |
| ' | Apostrophe | `&#39;` |
| (c) | Copyright | `&copy;` |

---

## Mixed Content Example

Here's a paragraph followed by a code block with a table:

```javascript
const config = {
  theme: 'catppuccin-mocha',
  features: ['highlight', 'preview', 'save'],
};
```

| Setting | Value |
|---------|-------|
| Theme | Catppuccin Mocha |
| Font | Fira Code |
| Tab Size | 2 |

> Configuration is loaded from the `config` object shown above.

And finally, a checklist:

- [x] Write the code
- [ ] Test thoroughly
- [ ] Ship it

---

## Edge Cases

This section tests various edge cases in Markdown rendering.

### Empty elements

A paragraph, then a horizontal rule:

---

Then another paragraph.

### Very long line

This is a very long line of text that should test how the editor and preview handle line wrapping when there are no natural break points and the content extends far beyond the visible area of the container without any spaces or breaks in between creating a continuous stream of characters that pushes the layout.

### Mixed inline styles

**Bold *italic `code`* and [link](https://example.com)** with ~~strikethrough~~ at the end.

### Escaped characters

\*Not italic\* \*\*Not bold\*\* \#Not a heading

### HTML entities

The ampersand (&), less-than (<), and greater-than (>) signs should render correctly.

---

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+`` | Inline code |
| `Ctrl+1/2/3` | Heading level 1/2/3 |
| `Ctrl+Shift+K` | Code block |
| `Ctrl+Shift+L` | List item |
| `Ctrl+S` | Save file |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

---

*This document was created to showcase the Flamme editor's Markdown rendering capabilities.*
