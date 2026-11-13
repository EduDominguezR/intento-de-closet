# Security Specification — Closetly Firestore Rules

## 1. Data Invariants
1. **Strict Ownership**: Every document in `users`, `garments`, `outfits`, `lookbook`, `calendar_entries`, and `outfit_uses` belongs strictly to a single authenticated `uid`. Cross-user reads, queries (`list`), updates, or deletes are denied.
2. **Immutable Ownership (`userId`)**: Once a `garments`, `outfits`, `lookbook`, `calendar_entries`, or `outfit_uses` document is created, its `userId` field and `createdAt` timestamp cannot be modified.
4. **Strict Schema & Bounds**:
   - All document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars).
   - `garments.name` and `outfits.name` are strings of 1–80 chars.
   - `garments.category` is strictly within `['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory']`.
   - `garments.accessorySlot` is required and within `['head', 'neck', 'hand']` if and only if `category == 'accessory'`.
   - Array bounds: `season.size() <= 4`, `occasion.size() <= 5`, `tags.size() <= 15`, `outfits.items.size() <= 8`.
   - `outfits.collection` is strictly within `['work', 'party', 'casual', 'travel', 'custom']`.
   - `createdAt` and `updatedAt` must equal `request.time` on create/update.
5. **PII Isolation**: `users/{uid}` contains `email` and is readable/writable strictly by `request.auth.uid == uid`; `allow list` on `users` is `false`.

## 2. The "Dirty Dozen" Attack Payloads
1. Unauthenticated read on `garments/{id}` -> `PERMISSION_DENIED`.
2. User B attempts `get` or `list` on User A's `garments` or `outfits` -> `PERMISSION_DENIED`.
3. User B attempts `create` on `garments/{id}` with `userId: 'userA'` -> `PERMISSION_DENIED`.
4. User A attempts `update` on `garments/{id}` changing `userId` to `'userB'` -> `PERMISSION_DENIED`.
5. User A attempts `set` on `users/userA` with invalid `avatarConfig.renderer` (e.g., `'rpm'`) or missing `renderer` -> `PERMISSION_DENIED`.
6. User A attempts `create` on `garments/{id}` with invalid `category: 'hat'` -> `PERMISSION_DENIED`.
7. User A attempts `create` on `garments/{id}` with `name` > 80 characters -> `PERMISSION_DENIED`.
8. User A attempts `create` on `garments/{id}` with `category: 'accessory'` and missing `accessorySlot` -> `PERMISSION_DENIED`.
9. User A attempts `create` on `garments/{id}` with ghost/shadow field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
10. User A attempts `create` on `outfits/{id}` with 9 items (`items.size() > 8`) -> `PERMISSION_DENIED`.
11. User A attempts `create` on `outfits/{id}` with invalid `collection: 'vip'` -> `PERMISSION_DENIED`.
12. User A attempts `list` on `users` collection -> `PERMISSION_DENIED`.
