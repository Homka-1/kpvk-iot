import { loadEnv } from '../src/config/load-env.js';

// e2e-тесты работают только с тестовой базой (NFR-010): по умолчанию .env.test.
loadEnv('.env.test');

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('e2e-тесты должны использовать тестовую базу данных (имя оканчивается на _test)');
}
