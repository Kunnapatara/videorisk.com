import path from 'path';
import fs from 'fs';
import os from 'os';
import { runAuthAndOwnershipTests } from './auth_and_ownership.test';
import { runProductCapabilitiesTests } from './product_capabilities.test';
import { runPersistenceAndBillingHardeningTests } from './persistence_and_billing_hardening.test';
import { runStorageFailClosedTests } from './storage_fail_closed.test';
import { runFreeCreditHardeningTests } from './free_credit_hardening.test';

async function main() {
  console.log('######################################################');
  console.log('# VIDEORISK.COM — MASTER VERIFICATION TEST SUITE     #');
  console.log('# Security, Isolation, Context & Capability Proofs   #');
  console.log('######################################################');

  const startTime = Date.now();

  try {
    // Run Suite 1
    await runAuthAndOwnershipTests();

    // Run Suite 2
    await runProductCapabilitiesTests();

    // Run Suite 3
    await runPersistenceAndBillingHardeningTests();

    // Run Suite 4: Storage Fail-Closed
    await runStorageFailClosedTests();

    // Run Suite 5: Free Credit Claim Hardening
    await runFreeCreditHardeningTests();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 ALL AUTOMATED VERIFICATION SUITES COMPLETED SUCCESSFULLY in ${elapsed}s!`);
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ MASTER VERIFICATION RUN FAILED:', err);
    process.exit(1);
  }
}

main();
