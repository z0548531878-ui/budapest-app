#!/bin/bash
# usage: tools/commons_query.sh "query one|query two|..."   or   tools/commons_query.sh "titles:File:A.jpg|File:B.jpg"
# runs the Commons search on GitHub Actions (this machine cannot reach Wikimedia) and prints the JSON result
set -e
R=z0548531878-ui/budapest-app
before=$(gh api "repos/$R/actions/workflows/commons-search.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0')
gh api -X POST repos/$R/actions/workflows/commons-search.yml/dispatches -f ref=main -f "inputs[q]=$1" -f "inputs[tag]=out" >/dev/null
for i in $(seq 1 60); do sleep 4; id=$(gh api "repos/$R/actions/workflows/commons-search.yml/runs?per_page=1" --jq '.workflow_runs[0].id'); [ "$id" != "$before" ] && break; done
until [ "$(gh api repos/$R/actions/runs/$id --jq .status)" = completed ]; do sleep 4; done
cd "$(dirname "$0")/.." && git fetch -q origin +refs/heads/commons-out:refs/remotes/origin/commons-out && git show origin/commons-out:out.json
