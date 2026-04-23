import localforage from 'localforage';

// Configure localforage
localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'LocalFileConverter',
  version: 1.0,
  storeName: 'files',
  description: 'Stores files locally for conversion processing'
});

export async function storeFile(id: string, file: File): Promise<void> {
  await localforage.setItem(id, file);
}

export async function getStoredFile(id: string): Promise<File | null> {
  return await localforage.getItem<File>(id);
}

export async function removeStoredFile(id: string): Promise<void> {
  await localforage.removeItem(id);
}

export async function clearStorage(): Promise<void> {
  await localforage.clear();
}
