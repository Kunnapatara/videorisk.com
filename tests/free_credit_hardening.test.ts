import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { apiRouter } from '../src/server/routes/api';
import { InMemoryStorageRepository } from '../src/server/storage';

export async function runFreeCreditHardeningTests() {
  console.log('\n======================================================');
  console.log('--- TEST SUITE 5: FREE CREDIT CLAIM HARDENING ---');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      throw new Error(`Test assertion failed: ${desc}`);
    }
  }

  // Set up temporary storage isolated for this suite
  const tempStorePath = path.resolve(os.tmpdir(), `videorisk_free_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.json`);
  const customStorage = new InMemoryStorageRepository(tempStorePath);

  // Create isolated express app referencing our custom router or testing via server instance
  // Note: apiRouter references default singleton storage. We can test both the API endpoints with registered users
  // and the storage layer isolation directly.
  
  // Create an express app with apiRouter for end-to-end HTTP verification
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // ---------------------------------------------------------------------------------
    // 1. REGISTRATION ENTITLEMENT & INITIAL BALANCE (10 starter credits, claimed = true)
    // ---------------------------------------------------------------------------------
    console.log('[1. Registration Starter Credits & Claim Flag]');
    const regEmail = `free_user_${Date.now()}@videorisk.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regEmail, password: 'password123' })
    });
    assert(regRes.status === 201, 'User registered successfully (201 Created)');
    const regData = await regRes.json();
    const token = regData.token;
    const user = regData.user;
    assert(user.creditsRemaining === 10, 'Newly registered user receives exactly 10 starter credits');
    assert(user.plan === 'free', 'Newly registered user is on free plan');
    assert(user.freeTrialClaimed === true, 'Registration marks free trial entitlement as claimed');

    // ---------------------------------------------------------------------------------
    // 2. REPEATED CLAIM REJECTION
    // ---------------------------------------------------------------------------------
    console.log('\n[2. Repeated Free Plan Claim Rejection]');
    const secondClaimRes = await fetch(`${baseUrl}/user/plan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan: 'free' })
    });
    assert(secondClaimRes.status === 409, 'Subsequent claim request rejected with 409 Conflict');
    const secondClaimData = await secondClaimRes.json();
    assert(secondClaimData.alreadyClaimed === true, 'Response indicates alreadyClaimed: true');
    assert(secondClaimData.user.creditsRemaining === 10, 'User credit balance is NOT increased after second claim');

    // Verify GET /user still has exactly 10 credits
    const meRes = await fetch(`${baseUrl}/user`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json();
    assert(meData.creditsRemaining === 10, 'Authoritative balance remains exactly 10 after repeat attempt');

    // ---------------------------------------------------------------------------------
    // 3. CONCURRENT CLAIM PROTECTION (RACE CONDITION PREVENTION)
    // ---------------------------------------------------------------------------------
    console.log('\n[3. Concurrent Free Plan Claim Race Condition Protection]');
    // Create another fresh user
    const raceEmail = `race_user_${Date.now()}@videorisk.com`;
    const raceRegRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: raceEmail, password: 'password123' })
    });
    const raceRegData = await raceRegRes.json();
    const raceToken = raceRegData.token;

    // Fire 10 concurrent requests to /api/user/plan with plan: 'free'
    const concurrentRequests = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/user/plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${raceToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: 'free' })
      })
    );
    const concurrentResponses = await Promise.all(concurrentRequests);
    // All concurrent repeat attempts should be rejected with 409 because registration already granted the entitlement
    const statuses = concurrentResponses.map(r => r.status);
    assert(statuses.every(s => s === 409), 'All concurrent free claim attempts on registered user rejected with 409');

    // Verify balance after concurrent attempts remains strictly 10
    const raceMeRes = await fetch(`${baseUrl}/user`, {
      headers: { Authorization: `Bearer ${raceToken}` }
    });
    const raceMeData = await raceMeRes.json();
    assert(raceMeData.creditsRemaining === 10, 'User credit balance did not inflate under 10 concurrent requests');

    // ---------------------------------------------------------------------------------
    // 4. STORAGE LEVEL: UNCLAIMED USER CONCURRENCY & ATOMICITY
    // ---------------------------------------------------------------------------------
    console.log('\n[4. Storage Level: Unclaimed Account Concurrency & Atomicity]');
    // Create a mock user in customStorage without freeTrialClaimed (simulating legacy or 0-credit account)
    const rawUser = await customStorage.users.createUser('unclaimed@videorisk.com', 'hash', 'salt', 0, 'free');
    // Force freeTrialClaimed to false to test atomic first claim
    await customStorage.users.updateUser(rawUser.id, { freeTrialClaimed: false });

    // Send 10 concurrent claimFreeTrial calls
    const claimPromises = Array.from({ length: 10 }).map(() =>
      customStorage.users.claimFreeTrial(rawUser.id)
    );
    const claimResults = await Promise.all(claimPromises);

    const successfulClaims = claimResults.filter(r => !r.alreadyClaimed);
    const rejectedClaims = claimResults.filter(r => r.alreadyClaimed);

    assert(successfulClaims.length === 1, 'Exactly one concurrent call successfully claimed the entitlement');
    assert(rejectedClaims.length === 9, 'All 9 remaining concurrent calls were rejected as alreadyClaimed');

    const finalRawUser = await customStorage.users.getUser(rawUser.id);
    assert(finalRawUser?.creditsRemaining === 10, 'User balance strictly equals 10 credits (no duplicate grant)');
    assert(finalRawUser?.freeTrialClaimed === true, 'User freeTrialClaimed is permanently true');

    // ---------------------------------------------------------------------------------
    // 5. DURABILITY ACROSS SERVER RESTARTS
    // ---------------------------------------------------------------------------------
    console.log('\n[5. Durability Across Storage Restarts]');
    // Create new storage instance pointing to same file
    const reloadedStorage = new InMemoryStorageRepository(tempStorePath);
    const reloadedUser = await reloadedStorage.users.getUser(rawUser.id);
    assert(reloadedUser?.freeTrialClaimed === true, 'freeTrialClaimed flag persisted across storage restart');
    assert(reloadedUser?.creditsRemaining === 10, 'Balance preserved across storage restart');

    // Attempting claim on reloaded storage should still be rejected
    const reloadedClaim = await reloadedStorage.users.claimFreeTrial(rawUser.id);
    assert(reloadedClaim.alreadyClaimed === true, 'Claim on reloaded storage rejected as already claimed');
    assert(reloadedClaim.user.creditsRemaining === 10, 'Balance preserved with zero increase after restart attempt');

    // ---------------------------------------------------------------------------------
    // 6. USER ISOLATION
    // ---------------------------------------------------------------------------------
    console.log('\n[6. Authenticated User Isolation]');
    // User C claiming free trial must not affect User D
    const userC = await customStorage.users.createUser('user_c@videorisk.com', 'h', 's', 25, 'creator');
    const userD = await customStorage.users.createUser('user_d@videorisk.com', 'h', 's', 50, 'pro');

    assert(userC.creditsRemaining === 25, 'User C has distinct balance (25 credits)');
    assert(userD.creditsRemaining === 50, 'User D has distinct balance (50 credits)');

    const claimC = await customStorage.users.claimFreeTrial(userC.id);
    assert(claimC.alreadyClaimed === true, 'User C cannot claim free trial');
    assert((await customStorage.users.getUser(userD.id))?.creditsRemaining === 50, 'User D balance unaffected by User C action');

    // ---------------------------------------------------------------------------------
    // 7. TAMPER RESISTANCE & PAID TIER PROTECTION
    // ---------------------------------------------------------------------------------
    console.log('\n[7. Tamper Resistance & Paid Plan Protection]');
    // Attempting to bypass by injecting arbitrary fields or extra credits in /api/user/plan
    const tamperRes = await fetch(`${baseUrl}/user/plan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan: 'free',
        credits: 9999,
        freeTrialClaimed: false
      })
    });
    assert(tamperRes.status === 409, 'Tampered free plan request rejected with 409');
    const userAfterTamper = await (await fetch(`${baseUrl}/user`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    assert(userAfterTamper.creditsRemaining === 10, 'Credits remain 10 despite arbitrary request body attributes');

    // Attempting to claim paid tier directly without checkout still rejected with 400
    const paidTiers = ['creator', 'pro', 'agency', 'audit_once'];
    for (const paidTier of paidTiers) {
      const paidRes = await fetch(`${baseUrl}/user/plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: paidTier })
      });
      assert(paidRes.status === 400, `Direct upgrade to ${paidTier} without checkout rejected with 400`);
    }

    console.log('\n======================================================');
    console.log(`TEST SUITE 5 COMPLETE: ${passed}/${total} assertions passed!`);
    console.log('======================================================\n');
  } finally {
    server.close();
    if (fs.existsSync(tempStorePath)) {
      try {
        fs.unlinkSync(tempStorePath);
      } catch {}
    }
  }
}
