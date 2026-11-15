/**
 * The last Flow Family data seen on this phone, so a screen opened offline
 * shows something — with the time it's from — instead of an error.
 *
 * Kept per account, and removed when nobody is signed in: a dependent's
 * spending must not stay on a phone after the guardian signs out of it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "flow.family.v1.";
const keyFor = (userId: string, name: string) => `${PREFIX}${userId}.${name}`;

export interface Cached<T> {
  savedAt: string;
  data: T;
}

export async function readCache<T>(userId: string, name: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, name));
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(userId: string, name: string, data: T): Promise<string> {
  const savedAt = new Date().toISOString();
  try {
    await AsyncStorage.setItem(keyFor(userId, name), JSON.stringify({ savedAt, data }));
  } catch {
    /* a full disk only costs the offline copy */
  }
  return savedAt;
}

/** Everything Flow Family saved, for every account — on sign-out and account deletion. */
export async function clearAllCaches(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}

/** One cached entry, e.g. a dependent's feed after access ended. */
export async function dropCache(userId: string, name: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId, name));
  } catch {
    /* ignore */
  }
}
