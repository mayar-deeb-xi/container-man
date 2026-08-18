"use client";

import { Direction } from "radix-ui";

export type TextDirection = "ltr" | "rtl";

/**
 * Tells every Radix primitive which way the document reads.
 *
 * Without it, primitives that depend on direction keep their left-to-right
 * behaviour under `dir="rtl"`: arrow keys in menus move the wrong way and popovers
 * collide with the edge they were meant to avoid.
 *
 * Wrapped in explicit declarations rather than re-exported directly — the package
 * emits declarations, and a bare `export const X = Direction.X` leaves the compiler
 * unable to name Radix's internal prop types.
 */
export function DirectionProvider({
  dir,
  children,
}: {
  dir: TextDirection;
  children?: React.ReactNode;
}) {
  return <Direction.DirectionProvider dir={dir}>{children}</Direction.DirectionProvider>;
}

/**
 * The direction of the nearest `DirectionProvider`, defaulting to `ltr`.
 *
 * Radix accepts only *physical* sides (`left`/`right`), so components that want to
 * position themselves relative to the reading order resolve it through this.
 */
export function useDirection(localDir?: TextDirection): TextDirection {
  return Direction.useDirection(localDir);
}
