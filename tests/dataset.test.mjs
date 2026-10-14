import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const py = join(root, ".venv", "bin", "python");

test("screenshot dataset generator (ml/test_dataset.py)", { skip: !existsSync(py) && "no .venv (python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt)" }, () => {
  const r = spawnSync(py, [join(root, "ml", "test_dataset.py")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
