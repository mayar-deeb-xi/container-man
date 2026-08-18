"use client";

import { useEffect, useState } from "react";

/**
 * Trails `value` by `delay` milliseconds.
 *
 * The search box feeds the query key, and a key change is a request. Without this
 * every keystroke would fire one, and the answers could arrive out of order.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
