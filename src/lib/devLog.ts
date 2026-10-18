/**
 * Console output for development builds only.
 *
 * React Native keeps console calls in release builds, where they go to the
 * device log — readable over a cable with Console.app and included in
 * sysdiagnose reports. The sync warnings carry server error messages about
 * someone's financial records; they're for the developer's terminal, not the
 * phone's log (MASVS-STORAGE-2, MASTG: no sensitive data in logs).
 */
declare const __DEV__: boolean | undefined;

export const isDev = typeof __DEV__ !== "undefined" && __DEV__ === true;

export function devWarn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}
