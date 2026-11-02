# ADR 0004: Let the normal Pi model loop choose UI

## Status

Accepted — retrospective.

## Context

Useful UI includes comparisons and exploration, not only explicit requests for forms. An automatic trigger would not reliably distinguish these cases from simple questions or requests for plain text.

## Decision

Expose OpenUI as a tool in Pi's normal model loop. Use active tool guidance for the language and runtime contract, and the bundled skill for task-driven interface selection. Let the model choose UI when useful, even without an explicit request, while respecting requests for plain text.

## Consequences

- Installing the skill does not guarantee that every suitable response becomes interactive; selection depends on model judgment and available tools.
- Pi owns provider authentication and model calls. OpenUI validates and renders documents and returns typed outcomes or diagnostics.
- Submission supplies input, not blanket permission for unrelated actions. Local exploration returns no answer.
- Deterministic CLI checks establish integration behavior, not the quality of an external model's UI choices. Real-model evaluation remains separate.

## References

- [Task-driven guidance: a3f8aef](https://github.com/FireTheDevil/pi-openui/commit/a3f8aef)
- [Model evaluation and architecture](../model-evaluation.md)
- [Bundled OpenUI skill](../../skills/openui/SKILL.md)
