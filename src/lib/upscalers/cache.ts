import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'models-cache';
const STORE_NAME = 'models';

let db: IDBPDatabase | null = null;

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return db;
}

export async function cacheModel(name: string, data: ArrayBuffer) {
  const database = await getDB();
  await database.put(STORE_NAME, data, name);
}

export async function getCachedModel(name: string): Promise<ArrayBuffer | null> {
  const database = await getDB();
  return (await database.get(STORE_NAME, name)) || null;
}
