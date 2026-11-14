/**
 * Standalone Shim for 'next/cache'
 */
export function revalidatePath(_path: string, _type?: 'page' | 'layout'): void {
  // No-op on standalone backend server
}

export function revalidateTag(_tag: string): void {
  // No-op on standalone backend server
}

export function unstable_cache<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}
