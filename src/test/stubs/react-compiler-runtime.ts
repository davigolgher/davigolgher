/**
 * The React Compiler's memo cache, for tests only.
 *
 * The app is compiled for React 19, whose `react/compiler-runtime` provides
 * this. The tests render with the repository root's React 18, so the
 * compiler is told to target 18 (vite.config.ts) and its runtime import
 * lands here: one array per component instance, every slot starting as the
 * sentinel the compiled code compares against.
 */
import { useState } from "react";

const EMPTY = Symbol.for("react.memo_cache_sentinel");

export function c(size: number): unknown[] {
  return useState(() => new Array<unknown>(size).fill(EMPTY))[0];
}
