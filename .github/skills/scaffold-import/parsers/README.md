# AAC parsers (BRD v3.1 §4, v3.1.10)

Parse Architecture-as-Code (AAC) files into a common IR that the architect's synthesis mode can consume. Three formats in v3.1.10:

| Format | Extensions | Parser |
|---|---|---|
| Structurizr DSL | `.dsl` | [`parse-structurizr.js`](../../../scripts/parse-structurizr.js) |
| PlantUML C4 | `.puml`, `.plantuml` | [`parse-plantuml-c4.js`](../../../scripts/parse-plantuml-c4.js) |
| Mermaid C4 | `.mmd`, `.mermaid` | [`parse-mermaid-c4.js`](../../../scripts/parse-mermaid-c4.js) |

Adapted from external-harness AAC review per BRD v3.1 §4 (v3.1.10). These are **minimum viable** — extract entities and relationships, not full semantics. Advanced features (macros, includes, themes) deferred to v3.2.

## Common IR

All three parsers output the same JSON schema:

```json
{
  "source_format": "structurizr" | "plantuml-c4" | "mermaid-c4",
  "source_file": "path/to/input.dsl",
  "system_name": "MyApp",
  "containers": [
    {
      "id": "web",
      "name": "Web Application",
      "technology": "React",
      "description": "Serves the UI"
    }
  ],
  "components": [
    {
      "id": "auth",
      "container_id": "web",
      "name": "Auth Middleware",
      "technology": "JWT"
    }
  ],
  "relationships": [
    {
      "from": "web",
      "to": "api",
      "description": "makes HTTP calls to",
      "technology": "HTTPS/JSON"
    }
  ],
  "external_systems": [
    {"id": "auth0", "name": "Auth0", "description": "OIDC provider"}
  ],
  "notes": ["Any lines the parser couldn't classify — preserved for human review"]
}
```

## Integration with scaffold-import

`scaffold-import` (BRD v3.1 §2, v3.1.1) accepts these formats in Q0 Branch B:

1. User provides `--architecture-aac path/to/file.dsl` (or `.puml`, `.mmd`)
2. `scaffold-import` detects the extension, invokes the appropriate parser
3. Parser writes IR JSON to `specs/design/architecture-ir.json`
4. Parser ALSO renders a Markdown fallback to `specs/design/architecture.md` (so downstream agents can read it as usual)
5. `specs/design/.imported` sentinel records `source_format`

Downstream architect synthesis-mode reads either the IR JSON (preferred, richer) or the Markdown fallback.

## What's covered in v3.1.10

**Structurizr DSL** — the subset most projects use:
- `workspace "name" { model { ... } views { ... } }` boilerplate
- `<id> = softwareSystem "Name" "Description" { ... }`
- `<id> = container "Name" "Description" "Technology"`
- `<id> = component "Name" "Description" "Technology"`
- `<id> -> <id> "Description" "Technology"` relationships
- External `person "Name"` treated as external system

**Not covered** (silent skip, appear in `notes`): `!include`, `!plugin`, `!script`, macros, deployment views, styles, themes, dynamic views.

**PlantUML C4** — the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) macros:
- `Person(id, "Label", "Desc")`
- `System(id, "Label", "Desc")`
- `System_Ext(id, "Label", "Desc")`
- `Container(id, "Label", "Tech", "Desc")`
- `ContainerDb(...)`, `ContainerQueue(...)`
- `Component(id, "Label", "Tech", "Desc")`
- `Rel(from, to, "Label", "Tech")`
- `Rel_Back`, `Rel_D`, `Rel_U`, `Rel_L`, `Rel_R` (direction ignored, kept as relationship)
- Nested `System_Boundary(id, "Label") { ... }` → container_id inference

**Not covered**: dynamic diagrams, sequence, deployment nodes, `!includeurl`, `!theme`.

**Mermaid C4** — [Mermaid C4Context / C4Container / C4Component](https://mermaid.js.org/syntax/c4.html) syntax:
- `C4Context`, `C4Container`, `C4Component` diagram type markers
- `Person(id, "Label", "Desc")`, `System(id, "Label", "Desc")`
- `Container(id, "Label", "Tech", "Desc")`
- `Rel(from, to, "Label", "Tech")`
- `System_Boundary` / `Container_Boundary`

**Not covered**: styles, `title`, sub-diagrams via `%%{init}%%` config.

## Failure modes

If a parser can't extract at least one container or system, it prints a warning and writes a minimal IR with the raw source in `notes[]`. Human review is expected before the architect proceeds.

## Testing

```bash
node scripts/parse-structurizr.js  fixtures/example.dsl
node scripts/parse-plantuml-c4.js  fixtures/example.puml
node scripts/parse-mermaid-c4.js   fixtures/example.mmd
```

Each prints the IR JSON to stdout.
