# Portable Spend Grants

An unnumbered ERC draft for a signed spend grant: one signature that lets a delegate spend native currency and ERC-20s under per-call, rolling, and lifetime caps.

- **Draft in this repo:** [`ERCS/erc-draft_spend_grants.md`](ERCS/erc-draft_spend_grants.md)
- **Magicians thread:** [placeholder](https://ethereum-magicians.org/t/placeholder) — replace with `https://ethereum-magicians.org/t/<slug>/<id>` when the topic exists
- **ERC (once numbered):** `https://github.com/ethereum/ERCs/blob/master/ERCS/erc-XXXX.md`

## Why

`approve` is usually one token, no expiry, and no trailing window. “Daily” allowances that reset at midnight let someone spend the cap twice in two hours. Wallet permission APIs exist, but they leave the meaning of the permission opaque, so two implementations can show the same hash and still disagree on the window or whether a second asset has its own remaining.

This draft is that object: typed terms, a canonical rendering, JSON interchange, and an on-chain remaining store. Tokens do not need a hook. The registry never moves funds.

## The grant

A principal signs an [EIP-712](https://eips.ethereum.org/EIPS/eip-712) `SpendGrant` bound to one chain and one registry:

- **Who** — `principal` and `delegate`
- **Where funds may go** — one recipient, or any
- **Which assets** — native currency is the [ERC-7528](https://eips.ethereum.org/EIPS/eip-7528) address `0xEeee…EEeE`; everything else is an ERC-20. Up to 16 assets, unique and sorted
- **How much** — each asset has `maxPerCall`, `maxPerWindow`, and `maxTotal`. Zero is never unlimited
- **How those caps combine** — **and** (independent remaining per asset) or **or** (one shared pie)
- **When** — `validAfter` inclusive, `validUntil` exclusive
- **Window** — a trailing lookback in seconds (`86400` is 24 hours, not a UTC day). A debit drops out when its age is `>= windowSeconds`. Lifetime never resets

Contract principals validate with [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271); [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) accounts also accept their own key's signature. Revoke is principal-only, per hash, and permanent.

The registry’s `consume` records the debit. A separate executor must call it in the same transaction as the transfer and revert if either step fails. This draft does not specify account adapters, ERC-7710 caveats, swap venues, or compliance screening.

## This repository

|                                       |                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Draft ERC                             | [`ERCS/erc-draft_spend_grants.md`](ERCS/erc-draft_spend_grants.md)                                               |
| Golden vectors                        | [`vectors/v1.json`](vectors/v1.json)                                                                             |
| Solidity reference                    | [`src/`](src/), tests in [`test/`](test/)                                                                         |
| TypeScript hashing / rendering / JSON | [`packages/grants/`](packages/grants/)                                                                           |

Neighboring standards (ERC-7710, 7715, 8226, 8312) are cited in Rationale only. Notes: [`docs/neighbors.md`](docs/neighbors.md).

## Status

Draft. Unaudited. [CC0 1.0](LICENSE.md).

No ERC number yet — do not invent one. The Magicians thread and the numbered ERC URL above are placeholders until a topic is posted and [ethereum/ERCs](https://github.com/ethereum/ERCs) assigns a number. `discussions-to` must be a real topic of the form `https://ethereum-magicians.org/t/<slug>/<id>`.

## Check the vectors

From the repo root:

```bash
pnpm install   # also installs pinned forge-std into lib/
pnpm build
pnpm test      # forge tests (256 fuzz runs, set in foundry.toml), then TypeScript tests
```

`pnpm test:sol` and `pnpm test:ts` run either half.

Solidity and TypeScript must reproduce the same domain separator, struct hash, digest, and rendering bytes.

## Promote to the ERCs fork

This repository holds the only copy of the reference. The ERC submission layout is generated from it:

```bash
pnpm erc:check                      # assemble assets/erc-draft_spend_grants in a temp dir and run its tests standalone
pnpm erc:promote -- --to ../ERCs    # write ERCS/erc-draft_spend_grants.md and assets/erc-draft_spend_grants/ into an ERCs checkout
```

`erc:promote` only writes files; review and commit in the ERCs checkout.

Discussion belongs on the Magicians thread (placeholder above). If you want to send a change, fork and open a pull request.
