import { db, sessionId } from '../../matches/data/match-repository';

export * from './api';
export async function deviceCredentials(database = db) {
  const deviceId = await sessionId(database);
  const deviceSecret = await database.transaction('rw', database.metadata, () =>
    database.metadata.get('device-secret').then((saved) => {
      if (saved) return saved.value;
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const value = btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      return database.metadata.add({ key: 'device-secret', value }).then(() => value);
    }),
  );
  return { deviceId, deviceSecret };
}
