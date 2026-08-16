#!/usr/bin/env bash
set -euo pipefail

# 发布流程与 nutriflow 一致：校验 -> 推 main -> 把 public/ 叠一个提交推到 gh-pages -> 触发 Pages 重建。
# REPO 换成你自己的 owner/name。
REPO="${WHEREHOME_REPO:-wang-piaoliang/wherehome}"

git diff --check
npm test
git push github main

source_commit="$(git rev-parse --short HEAD)"
pages_tree="$(git rev-parse "HEAD:public")"

if git fetch github gh-pages 2>/dev/null; then
  pages_parent="$(git rev-parse FETCH_HEAD)"
  if [ "$(git rev-parse "${pages_parent}^{tree}")" = "${pages_tree}" ]; then
    echo "gh-pages 已经是当前 public/ 内容，跳过发布提交。"
    gh api --method POST "repos/${REPO}/pages/builds" --silent
    exit 0
  fi
  pages_commit="$(git commit-tree "${pages_tree}" -p "${pages_parent}" -m "Publish wherehome public/ from ${source_commit}")"
else
  pages_commit="$(git commit-tree "${pages_tree}" -m "Publish wherehome public/ from ${source_commit}")"
fi

git push github "${pages_commit}:refs/heads/gh-pages"
gh api --method POST "repos/${REPO}/pages/builds" --silent
echo "已发布：https://$(echo "$REPO" | cut -d/ -f1).github.io/$(echo "$REPO" | cut -d/ -f2)/"
