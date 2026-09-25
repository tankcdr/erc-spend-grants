# ERC: Portable Spend Grants

Putting this up before opening the ERCs PR. Draft (unnumbered):

https://github.com/tankcdr/ERCs/blob/erc-draft-spend-grants/ERCS/erc-draft_spend_grants.md

Vectors and a compact Solidity reference are in the same branch under `assets/erc-draft_spend_grants/`.

---

Agents and session keys keep running into the same object: “this key may spend up to X of these assets, for a while, and I can kill it.” ERC-20 `approve` is the wrong shape (usually one token, no expiry, no trailing window). Calendar-day “daily caps” are also the wrong shape: they reset at midnight, so you can spend the cap twice in two hours.

This draft is that object, and only that object. The signed type is `SpendGrant`.

A principal signs: who may act, which assets (native is the ERC-7528 `0xEeee…EEeE` address, everything else is ERC-20), per-call / trailing-window / lifetime caps, whether those caps combine as **and** (independent remaining) or **or** (one pie), who may receive funds, and a time range. The digest is bound to one chain and one registry. The registry records remaining and revocation. It never moves tokens. Whatever actually transfers has to call `consume` in the same transaction or the spend does not count.

Example: “on this chain, the agent may spend up to 1000 USDC **and** 1 ETH per trailing 24 hours.” That is one signature, one hash, one revoke.

**And** vs **or** is literal. And means both budgets are fully spendable. Or means the signed maxima are 100% of the same pie. No price oracle.

The window is a lookback of `windowSeconds`, not “today.” Zero is never unlimited.

---

Where this sits:

- **ERC-7710 / 7715** are the redemption bus and the wallet RPC. 7710 leaves permission bytes opaque. This is a typed meaning those bytes can carry. It does not require 7710.
- **ERC-8226** is a regulated one-asset grant with a compliance provider and freeze. Different job. Reason names match 8226 where the conditions match (`EXPIRED`, `REVOKED`, `OVER_TX_CAP`, …).
- **ERC-8312** meters remaining of an opaque capability. This draft *is* the capability; the registry is the v1 remaining store.

The **delegate** is who the principal named in the grant. The **executor** is the one contract allowed to call `consume`, set immutably on the registry. You pick the executor by picking the registry.

I would like eyes on:

1. EIP-7702 principals: the key's ECDSA signature is accepted before ERC-1271, so outstanding grants survive delegation changes. Any objection?
2. `consume` does not bind `msg.sender` to `delegate`. Binding is “this registry’s executor.”
3. Or-mode in v1. Worth keeping, or ship and-only?

Draft ERC and assets are on `tankcdr/ERCs` branch `erc-draft-spend-grants`. I will open the ERCs PR once this thread has a stable URL for `discussions-to`.
