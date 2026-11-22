# Notevox Firestore Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Core Data Invariants

1. **Strict Ownership Isolation**: Every document under `/users/{userId}` and its subcollections (`subjects`, `notes`, `tasks`, `activities`, `billingRecords`) belongs strictly to `userId == request.auth.uid`, with `ownerId == request.auth.uid`. Cross-user reads, writes, lists, or deletes are universally denied.
2. **Master Gate Parent Existence**: Subcollection records (`subjects`, `notes`, `tasks`, `activities`, `billingRecords`) cannot be created, updated, read by ID, or deleted unless the parent profile `/users/{userId}` exists.
3. **Verified Identity Enforcement**: All write operations require an authenticated user with `request.auth.token.email_verified == true`.
4. **No PII Exposure**: No email, phone number, or physical address is stored in Firestore user profile documents, and `/users/{userId}` forbids `list` queries and restricts `get` strictly to `isOwner(userId)`.
5. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on creation and can never change on update. `updatedAt` must equal `request.time` on both creation and update. `ownerId` is immutable after creation.
6. **Strict Schema & Volumetric Guards**: Every string field enforces explicit `.size()` bounds, document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars), arrays (`keyTakeaways`, `flashcards`) enforce strict maximum lengths and element type checks, and no shadow/ghost fields are accepted (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update).
7. **Terminal State Locking**: Once a `BillingRecord` has `status == 'completed'`, no subsequent updates are permitted.
8. **Immutable Study Activity Logs**: `StudyActivity` documents cannot be altered after creation (`allow update: if false`).

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Collection | Malicious Payload / Operation | Expected Result |
|---|---|---|---|---|
| 1 | **Identity Spoofing** | `/users/{uid}/notes/{id}` | Create note with `ownerId: "victim-uid"` while authenticated as `"attacker-uid"` | `PERMISSION_DENIED` |
| 2 | **Cross-Tenant Read/List** | `/users/victim-uid/notes` | List or get notes belonging to `victim-uid` while signed in as `attacker-uid` | `PERMISSION_DENIED` |
| 3 | **Shadow / Ghost Field Injection** | `/users/{uid}` | Update profile with extra field `isAdmin: true` or `unlimitedCredits: true` | `PERMISSION_DENIED` |
| 4 | **Unverified Email Spoofing** | `/users/{uid}/subjects/{id}` | Create subject when `request.auth.token.email_verified == false` | `PERMISSION_DENIED` |
| 5 | **ID Poisoning** | `/users/{uid}/notes/{badId}` | Create note with document ID containing spaces/symbols or 200+ chars (`"bad id!@#$"`) | `PERMISSION_DENIED` |
| 6 | **Client Timestamp Forgery** | `/users/{uid}/tasks/{id}` | Create task with backdated `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` | `PERMISSION_DENIED` |
| 7 | **Immutable Field Tampering** | `/users/{uid}/notes/{id}` | Update note attempting to modify `createdAt` or `ownerId` | `PERMISSION_DENIED` |
| 8 | **Value Poisoning on Allowed Key** | `/users/{uid}/tasks/{id}` | Update task changing `priority` to invalid string `"SUPER_URGENT"` or a boolean `true` | `PERMISSION_DENIED` |
| 9 | **Array Exhaustion / Type Poisoning** | `/users/{uid}/notes/{id}` | Create note with 20 `keyTakeaways` (limit 15) or integer `[12345]` instead of strings | `PERMISSION_DENIED` |
| 10 | **Terminal State Mutation** | `/users/{uid}/billingRecords/{id}` | Update a `BillingRecord` whose existing `status` is `'completed'` to change `amountCents` to `0` | `PERMISSION_DENIED` |
| 11 | **Orphaned Subcollection Write (Master Gate)** | `/users/ghost-uid/subjects/sub-1` | Create a subject when parent `/users/ghost-uid` document does not exist | `PERMISSION_DENIED` |
| 12 | **Activity Log Tampering** | `/users/{uid}/activities/{id}` | Attempt to update `durationMinutes` on an existing `StudyActivity` log entry | `PERMISSION_DENIED` |
