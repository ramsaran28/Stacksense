import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Concatenate conditional class fragments (before Tailwind merge). */
function composeClassFragments(inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Resolve conflicting Tailwind utilities to a single class string. */
function mergeConflictClasses(classString: string): string {
  return twMerge(classString);
}

/** Merges `clsx` + `tailwind-merge` for component `className` props. */
export function cn(...inputs: ClassValue[]) {
  return mergeConflictClasses(composeClassFragments(inputs));
}
