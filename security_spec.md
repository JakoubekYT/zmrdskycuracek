# Security Specification — Apex Formula 3D Hall of Fame

## 1. Data Invariants

1. **Zero-PII Public Leaderboard Isolation**: Neither `/hall_of_fame_drivers/{userId}` nor `/hall_of_fame_laps/{recordId}` may store email addresses, phone numbers, or private user data. Only public leaderboard attributes (`userId`, `displayName`, `photoURL`, race stats, and lap times) are allowed.
2. **Strict Ownership & Verified Identity**:
   - A driver standing document `/hall_of_fame_drivers/{userId}` can only be created or updated by an authenticated user with `request.auth.uid == userId`, `request.auth.token.email_verified == true`, and `incoming().userId == request.auth.uid`.
   - A lap record document `/hall_of_fame_laps/{recordId}` can only be created or updated by an authenticated user with `request.auth.token.email_verified == true` and `incoming().userId == request.auth.uid`.
3. **Immutable Identity & Creation Timestamps**:
   - On update, `userId` and `createdAt` must remain strictly equal to `resource.data.userId` and `resource.data.createdAt`.
   - On create, `createdAt == request.time` and `updatedAt == request.time`. On update, `updatedAt == request.time`.
4. **Query Enforcer on List Operations**:
   - All `list` operations on `/hall_of_fame_drivers` and `/hall_of_fame_laps` require `resource.data.visibility == 'public'`, preventing unfiltered scraping of non-public documents.
5. **Monotonic Lap Record Improvement**:
   - Updating an existing `/hall_of_fame_laps/{recordId}` requires `incoming().lapTimeMs <= existing().lapTimeMs` and `incoming().trackId == existing().trackId`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Shadow Field Injection (`DriverStanding`)**: Adding `"isAdmin": true` to `/hall_of_fame_drivers/{uid}` -> Rejected by `.keys().hasOnly(...)`.
2. **Identity Spoofing (`DriverStanding`)**: Authenticated as `userA`, writing `/hall_of_fame_drivers/userB` with `userId: "userB"` -> Rejected by `userId == request.auth.uid`.
3. **Unverified Email Write**: Authenticated user with `email_verified: false` writing a lap record -> Rejected by `isVerifiedUser()`.
4. **Client Timestamp Forgery**: Providing a past or future timestamp for `createdAt` or `updatedAt` instead of `serverTimestamp()` -> Rejected by `incoming().updatedAt == request.time`.
5. **Immutable Field Mutation**: Changing `createdAt` or `userId` during an update -> Rejected by `incoming().createdAt == existing().createdAt`.
6. **Denial-of-Wallet Oversized String**: Sending a 10,000-character `displayName` -> Rejected by `data.displayName.size() <= 40`.
7. **ID Poisoning**: Creating a document with a 500-char or special-character document ID -> Rejected by `isValidId(recordId)`.
8. **Negative or Impossible Lap Time**: Creating a lap record with `lapTimeMs: 100` (0.1s) or `-5000` -> Rejected by `data.lapTimeMs >= 5000 && data.lapTimeMs <= 600000`.
9. **Invalid Tire Compound Enum**: Writing `tireCompound: "super-ultra-cheat"` -> Rejected by `data.tireCompound in ['soft', 'medium', 'hard', 'wet']`.
10. **Worse Lap Time Overwrite**: Updating an existing lap record with a slower `lapTimeMs` than `existing().lapTimeMs` -> Rejected by `incoming().lapTimeMs <= existing().lapTimeMs`.
11. **Track ID Tampering on Update**: Updating an existing lap record to point to a different `trackId` -> Rejected by `incoming().trackId == existing().trackId`.
12. **Unauthorized Document Deletion**: Attempting to `delete` a Hall of Fame driver standing or lap record -> Rejected by `allow delete: if false;`.

## 3. Red Team Audit & Verification Summary

- **Shadow Update Test**: Passed (`hasAll` + `hasOnly` enforced in `isValidDriverStanding` and `isValidTrackLapRecord`, plus `affectedKeys().hasOnly(...)` in `allow update`).
- **Email Spoofing Test**: Passed (`request.auth.token.email_verified == true` required on all writes).
- **PII Blanket Test**: Passed (zero PII fields in schema; `hasOnly` blocks adding `email` or `phone`).
- **Query Trust Test**: Passed (`allow list: if existing().visibility == 'public';` evaluates `resource.data`).
