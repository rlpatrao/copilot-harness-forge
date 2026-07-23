---
name: upgrade
description: Pull latest forge from GitHub and upgrade scaffolded project files in place. Preserves project state, merges config, reports what changed.
argument-hint: "[--check | --version VERSION]"
---

# /upgrade — In-Place Forge Upgrade

When the user runs `/upgrade`, follow these steps exactly:

## Step 1: Detect Current Version

Read `project-manifest.json` from the project root. Look for the `forge_version` section:

```json
"forge_version": {
  "version": "2.1.0",
  "sha": "abc1234",
  "scaffolded_at": "2025-01-15T10:00:00Z",
  "upgraded_at": null
}
```

If `forge_version` is missing or `project-manifest.json` doesn't exist, treat as **v0.0.0** (pre-v2.1 project). Print:
```
⚠ No forge_version found in project-manifest.json. Treating as pre-v2.1 project (v0.0.0).
```

Store the current version and SHA for comparison.

## Step 2: Pull Latest Forge

Clone the forge repo to a temp directory:

```bash
TEMP_DIR=$(mktemp -d)
git clone --depth 1 https://github.com/rlpatrao/claude_harness_forge.git "$TEMP_DIR"
```

If `--version VERSION` flag was provided, clone that specific tag:
```bash
git clone --depth 1 --branch "v${VERSION}" https://github.com/rlpatrao/claude_harness_forge.git "$TEMP_DIR"
```

If the clone fails (network error, tag not found), print an error and exit:
```
✗ Failed to clone forge repo. Check network connection and version tag.
```

Read the new version from `$TEMP_DIR/.claude-plugin/plugin.json`. Get the new SHA:
```bash
NEW_SHA=$(git -C "$TEMP_DIR" rev-parse --short HEAD)
```

## Step 3: Compare Versions

Compare current version+SHA against the newly cloned version+SHA.

If they match exactly (same version string AND same SHA), print:
```
✓ Already up to date (version {version}, sha {sha}).
```
Clean up temp dir and exit.

## Step 4: Diff Analysis

Compare the current project's forge-owned files against the temp dir. Build lists of:

- **New files** — exist in temp dir but not in project
- **Modified files** — exist in both but differ (use `diff -q`)
- **Removed files** — exist in project but not in temp dir

Check these directories:
```bash
# Compare agents
diff -rq .claude/agents/ "$TEMP_DIR/agents/" 2>/dev/null || true

# Compare skills
diff -rq .claude/skills/ "$TEMP_DIR/skills/" 2>/dev/null || true

# Compare hooks
diff -rq .claude/hooks/ "$TEMP_DIR/hooks/" 2>/dev/null || true

# Compare evals
diff -rq .claude/evals/ "$TEMP_DIR/evals/" 2>/dev/null || true

# Compare templates
diff -rq .claude/templates/ "$TEMP_DIR/templates/" 2>/dev/null || true
```

Categorize results into new/modified/removed per directory.

## Step 5: Check Mode (--check)

If the user passed `--check`, print the diff analysis report and exit **without making any changes**:

```
Forge Upgrade Check: {current_version} → {new_version}

Agents:    {N} modified, {N} new, {N} removed
Skills:    {N} modified, {N} new, {N} removed
Hooks:     {N} modified, {N} new, {N} removed
Evals:     {N} modified, {N} new, {N} removed
Templates: {N} modified, {N} new, {N} removed

New state templates: {list or "none"}
Config keys to add:  {list or "none"}

No changes made. Run /upgrade without --check to apply.
```

Clean up temp dir and exit.

## Step 6: Replace Forge-Owned Files (Category A)

These directories are fully owned by the forge. Replace them entirely:

```bash
# Remove old forge-owned directories
rm -rf .claude/agents/ .claude/skills/ .claude/hooks/ .claude/evals/ .claude/templates/

# Copy new versions
cp -r "$TEMP_DIR/agents/" .claude/agents/
cp -r "$TEMP_DIR/skills/" .claude/skills/
cp -r "$TEMP_DIR/hooks/" .claude/hooks/
cp -r "$TEMP_DIR/evals/" .claude/evals/
cp -r "$TEMP_DIR/templates/" .claude/templates/

# Replace forge-owned single files
cp "$TEMP_DIR/settings.json" .claude/settings.json
cp "$TEMP_DIR/architecture.md" .claude/architecture.md
cp "$TEMP_DIR/forge-reference.md" forge-reference.md
```

## Step 7: Add New State Templates

For each file in `$TEMP_DIR/state/`:
- If the file does **NOT** already exist in `.claude/state/`, copy it.
- **Never overwrite existing state files.** These contain user/project data.

```bash
for f in "$TEMP_DIR/state/"*; do
  fname=$(basename "$f")
  if [ ! -f ".claude/state/$fname" ]; then
    cp "$f" ".claude/state/$fname"
    echo "  NEW state template: $fname"
  fi
done
```

## Step 8: Merge project-manifest.json

Read the current `project-manifest.json` and the forge default template.

**Merge strategy:**
- Add new keys from the forge defaults that don't exist in the current manifest.
- **Never overwrite** existing user values (stack, evaluation, execution settings, etc.).
- Always update the `forge_version` section (Step 10).

Use `jq` to merge (new defaults as base, current manifest on top):
```bash
# Add new keys only — preserve all existing user config
jq -s '.[0] * .[1]' "$TEMP_DIR/templates/manifest-defaults.json" project-manifest.json > project-manifest.tmp.json
mv project-manifest.tmp.json project-manifest.json
```

If no default manifest template exists, just add new keys manually. Print what was added:
```
Config merged:
  + execution.new_field (default: "value")
  + verification.new_field (default: "value")
```

## Step 9: Merge program.md

The user's `.claude/program.md` contains a `## Instructions` section with project-specific instructions they have added.

**Merge strategy:**
1. Extract the `## Instructions` section (and everything after it) from the current `.claude/program.md`.
2. Read the new forge template `program.md` from `$TEMP_DIR/program.md`.
3. Replace everything in the new template **except** the `## Instructions` section.
4. Re-insert the user's extracted `## Instructions` block.

```bash
# Extract user's Instructions section
sed -n '/^## Instructions/,$p' .claude/program.md > /tmp/user-instructions.md

# Copy new program.md
cp "$TEMP_DIR/program.md" .claude/program.md

# If user had instructions, append them (replacing the template's default Instructions section)
if [ -s /tmp/user-instructions.md ]; then
  # Remove template's Instructions section and append user's
  sed -i '' '/^## Instructions/,$d' .claude/program.md
  cat /tmp/user-instructions.md >> .claude/program.md
fi
```

**Warning:** If the user has made edits outside the `## Instructions` section, those will be lost. Print:
```
⚠ program.md updated. Your ## Instructions section was preserved.
  Any edits outside ## Instructions were replaced with the new forge template.
```

## Step 10: Update forge_version

Write the updated version info to `project-manifest.json`:

```bash
jq --arg ver "$NEW_VERSION" \
   --arg sha "$NEW_SHA" \
   --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.forge_version.version = $ver | .forge_version.sha = $sha | .forge_version.upgraded_at = $ts' \
   project-manifest.json > project-manifest.tmp.json
mv project-manifest.tmp.json project-manifest.json
```

The resulting section should look like:
```json
"forge_version": {
  "version": "{new_version}",
  "sha": "{new_sha}",
  "scaffolded_at": "{preserved from original}",
  "upgraded_at": "{ISO timestamp of this upgrade}"
}
```

## Step 11: Clean Up

```bash
rm -rf "$TEMP_DIR"
```

## Step 12: Print Status Report

Print a comprehensive upgrade report:

```
╔══════════════════════════════════════════════╗
║         Forge Upgrade Complete               ║
╚══════════════════════════════════════════════╝

Version: {old_version} ({old_sha}) → {new_version} ({new_sha})

Files Replaced:
  Agents:    {count} files ({new} new, {modified} modified, {removed} removed)
  Skills:    {count} files ({new} new, {modified} modified, {removed} removed)
  Hooks:     {count} files ({new} new, {modified} modified, {removed} removed)
  Evals:     {count} files ({new} new, {modified} modified, {removed} removed)
  Templates: {count} files ({new} new, {modified} modified, {removed} removed)

State Files: {count} preserved (never touched)
New State Templates: {list or "none added"}

Config Merged:
  {list of new keys added, or "no new keys"}

program.md: Updated (## Instructions preserved)

What's New in {new_version}:
  {Read CHANGELOG.md or release notes from temp dir if available,
   otherwise print "See forge repo for changelog."}
```

## Step 13: Validate

Run the scaffold validation script to confirm the upgrade didn't break anything:

```bash
bash .claude/scripts/validate-scaffold.sh 2>&1 || true
```

If validation fails, print:
```
⚠ Post-upgrade validation found issues. Review the output above.
```

If validation passes:
```
✓ Post-upgrade validation passed.
```

---

## Gotchas

1. **Never touch state files.** `.claude/state/` contains user data (learned rules, failures, coverage baselines, cost logs). Only add NEW templates that don't already exist.

2. **Removed skills are cleaned up.** When the forge removes a skill between versions, the full directory replacement (`rm -rf` + `cp -r`) handles this automatically. No orphan skill directories will remain.

3. **program.md merge is lossy outside Instructions.** Users who edited sections other than `## Instructions` will lose those edits. The warning in Step 9 alerts them. This is by design — forge-owned sections of program.md should not be user-modified.

4. **Always clone to temp directory.** Never modify the forge plugin source. Always work from a fresh clone to ensure clean state.

5. **Pre-v2.1 projects.** Projects scaffolded before forge_version tracking will show v0.0.0. The upgrade will add the forge_version section to their manifest automatically.

6. **Network failures.** If git clone fails, the skill exits immediately without modifying any project files. The project is left in its original state.

7. **Version pinning.** Use `--version 2.1.0` to upgrade to a specific version instead of latest. Useful for teams that want to stay on a known-good release.
