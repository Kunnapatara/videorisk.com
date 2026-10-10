import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { InMemoryStorageRepository } from '../src/server/storage';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Storage fail-closed test failed: ${message}`);
}

export function runStorageFailClosedTests() {
  console.log('\n--- TEST SUITE 4: STORAGE FAIL-CLOSED STARTUP ---');

  const cases = [
    { name: 'invalid JSON', content: '{"users":' },
    { name: 'non-object JSON root', content: '[]' },
  ];

  for (const testCase of cases) {
    const filePath = path.join(
      os.tmpdir(),
      `videorisk_corrupt_store_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.json`,
    );

    try {
      fs.writeFileSync(filePath, testCase.content, 'utf-8');
      let threw = false;
      try {
        new InMemoryStorageRepository(filePath);
      } catch (error) {
        threw = error instanceof Error && error.message.includes('refusing to start');
      }
      assert(threw, `constructor rejects ${testCase.name} instead of starting with empty state`);
      console.log(`  ✅ PASS: rejects ${testCase.name}`);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  console.log('TEST SUITE 4 COMPLETE: 2/2 assertions passed!');
}
