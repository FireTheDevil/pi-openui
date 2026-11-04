---
name: Bug report
about: Report a reproducible problem with Pi OpenUI
title: ""
---

Before posting, search existing issues and read [CONTRIBUTING.md](https://github.com/FireTheDevil/pi-openui/blob/master/CONTRIBUTING.md). Remove secrets, usernames, home paths, private transcripts, and identifying screenshot content. Do not post sensitive vulnerability details publicly.

## What happened

Describe the actual behavior and any diagnostics.

## What you expected

Describe the expected behavior.

## Steps to reproduce

1. Start Pi with these arguments.
2. Run this tool or demo command.
3. Perform these interactions.

## Minimal OpenUI source

Include a complete document and the `show_ui` arguments or demo flags. Replace private data with synthetic values.

```openui
root = Stack([Text("Replace with the smallest reproduction")]);
```

## Environment

- OpenUI version or commit.
- Pi and Node.js versions.
- Operating system and terminal.
- Pi host TUI mode, regular or fullscreen.
- Interaction mode, display-only, local, or collect.
- Presentation, auto, inline, or fullscreen.
- Execution path, direct tool, native codemode, or conversion adapter.
- Adapter version and backend, if used.

## Evidence and checks

Add sanitized screenshots or diagnostics if useful. List relevant checks already run, results, and what remains unverified.
