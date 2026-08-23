#!/usr/bin/env node
// Three-way merge package-lock.json, ignoring resolved/integrity.
//
// Usage:
//   node scripts/merge-npm-lockfile.mjs --base a.json --ours b.json --theirs c.json --out d.json

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIGNATURE_FIELDS = new Set(["resolved", "integrity"]);
const TOP_LEVEL_ORDER = ["name", "version", "lockfileVersion", "requires", "packages"];

export class UnmergeableLockfileError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnmergeableLockfileError";
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function deepEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function stripSignatures(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const out = { ...entry };
  delete out.resolved;
  delete out.integrity;
  return out;
}

function ownKeys(object) {
  return object && typeof object === "object" ? Object.keys(object) : [];
}

function hasOwn(object, key) {
  return Boolean(object) && Object.hasOwn(object, key);
}

function threeWayPresence(hasBase, hasOurs, hasTheirs, baseValue, oursValue, theirsValue, path) {
  if (!hasOurs && !hasTheirs) return { present: false };
  if (!hasOurs) {
    if (!hasBase) return { present: true, value: clone(theirsValue) };
    if (deepEqual(theirsValue, baseValue)) return { present: false };
    throw new UnmergeableLockfileError(`${path}: delete vs change`);
  }
  if (!hasTheirs) {
    if (!hasBase) return { present: true, value: clone(oursValue) };
    if (deepEqual(oursValue, baseValue)) return { present: false };
    throw new UnmergeableLockfileError(`${path}: delete vs change`);
  }
  if (deepEqual(oursValue, theirsValue)) return { present: true, value: clone(oursValue) };
  if (hasBase && deepEqual(oursValue, baseValue))
    return { present: true, value: clone(theirsValue) };
  if (hasBase && deepEqual(theirsValue, baseValue))
    return { present: true, value: clone(oursValue) };
  if (!hasBase) {
    throw new UnmergeableLockfileError(`${path}: both added different values`);
  }
  throw new UnmergeableLockfileError(`${path}: both sides changed`);
}

function mergePackageEntry(base, ours, theirs, path) {
  const baseBody = stripSignatures(base ?? {});
  const oursBody = stripSignatures(ours);
  const theirsBody = stripSignatures(theirs);
  if (deepEqual(oursBody, theirsBody)) return oursBody;

  const fieldKeys = new Set([...ownKeys(baseBody), ...ownKeys(oursBody), ...ownKeys(theirsBody)]);
  const out = {};
  for (const field of fieldKeys) {
    if (SIGNATURE_FIELDS.has(field)) continue;
    const merged = threeWayPresence(
      hasOwn(baseBody, field),
      hasOwn(oursBody, field),
      hasOwn(theirsBody, field),
      baseBody[field],
      oursBody[field],
      theirsBody[field],
      `${path}.${field}`,
    );
    if (merged.present) out[field] = merged.value;
  }
  return out;
}

function mergePackages(basePackages, oursPackages, theirsPackages) {
  const keys = new Set([
    ...ownKeys(basePackages),
    ...ownKeys(oursPackages),
    ...ownKeys(theirsPackages),
  ]);
  const out = {};
  for (const key of [...keys].sort()) {
    const hasBase = hasOwn(basePackages, key);
    const hasOurs = hasOwn(oursPackages, key);
    const hasTheirs = hasOwn(theirsPackages, key);
    const path = `packages[${JSON.stringify(key)}]`;

    if (!hasOurs && !hasTheirs) continue;
    if (!hasOurs) {
      if (!hasBase) {
        out[key] = clone(theirsPackages[key]);
        continue;
      }
      if (deepEqual(theirsPackages[key], basePackages[key])) continue;
      throw new UnmergeableLockfileError(`${path}: delete vs change`);
    }
    if (!hasTheirs) {
      if (!hasBase) {
        out[key] = clone(oursPackages[key]);
        continue;
      }
      if (deepEqual(oursPackages[key], basePackages[key])) continue;
      throw new UnmergeableLockfileError(`${path}: delete vs change`);
    }

    out[key] = mergePackageEntry(
      hasBase ? basePackages[key] : {},
      oursPackages[key],
      theirsPackages[key],
      path,
    );
  }
  return out;
}

export function mergeLockfiles(base, ours, theirs) {
  const keys = new Set([...ownKeys(base), ...ownKeys(ours), ...ownKeys(theirs)]);
  const out = {};
  for (const key of keys) {
    if (key === "packages") {
      out.packages = mergePackages(base.packages, ours.packages, theirs.packages);
      continue;
    }
    const merged = threeWayPresence(
      hasOwn(base, key),
      hasOwn(ours, key),
      hasOwn(theirs, key),
      base[key],
      ours[key],
      theirs[key],
      key,
    );
    if (merged.present) out[key] = merged.value;
  }

  const ordered = {};
  for (const key of TOP_LEVEL_ORDER) {
    if (Object.hasOwn(out, key)) ordered[key] = out[key];
  }
  for (const key of Object.keys(out)) {
    if (!Object.hasOwn(ordered, key)) ordered[key] = out[key];
  }
  return ordered;
}

function requiredArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing ${flag}`);
  }
  return process.argv[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run() {
  try {
    const base = readJson(requiredArg("--base"));
    const ours = readJson(requiredArg("--ours"));
    const theirs = readJson(requiredArg("--theirs"));
    const outPath = requiredArg("--out");
    const merged = mergeLockfiles(base, ours, theirs);
    writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
