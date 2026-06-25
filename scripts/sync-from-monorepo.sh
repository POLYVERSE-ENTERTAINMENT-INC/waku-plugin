#!/usr/bin/env bash
# Sync the bundled creation skills from the Waku monorepo into this plugin.
# The plugin's skills are derived from `managed-skills/` in the product repo; run this
# at release time to refresh them. Path is parameterized — never hardcode a personal path.
#
#   MONOREPO=/path/to/polyverse_samantha bash scripts/sync-from-monorepo.sh
set -euo pipefail

MONOREPO="${MONOREPO:?set MONOREPO=/path/to/polyverse_samantha}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

# Routing-target skills: copied verbatim.
for s in waku-react-tailwind game-studio design; do
  rm -rf "$HERE/skills/$s"
  cp -R "$MONOREPO/managed-skills/$s" "$HERE/skills/$s"
done

# Creation skill: source is `waku-creator`; in the plugin it is renamed to `waku`.
rm -rf "$HERE/skills/waku"
cp -R "$MONOREPO/managed-skills/waku-creator" "$HERE/skills/waku"

cat >&2 <<'NOTE'
synced.
NOTE: after sync you must RE-APPLY the plugin-local edits to skills/waku/SKILL.md:
  - frontmatter `name: waku-creator` -> `name: waku`
  - replace the managed-agent "Delivery stage" with the local-delivery pointer to the
    `waku-cli` skill (see git history of skills/waku/SKILL.md).
(These edits live only in the plugin; the proper fix is to externalize delivery in the
monorepo source so this manual step goes away.)
NOTE
