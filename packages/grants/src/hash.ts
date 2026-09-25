import {
  concatHex,
  domainSeparator,
  hashStruct,
  hashTypedData,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";

import type { AssetLimit, SpendGrant, SpendGrantInterchange } from "./types.js";

export const SPEND_GRANT_DOMAIN_NAME = "SpendGrant";
export const SPEND_GRANT_DOMAIN_VERSION = "1";

/** Exact EIP-712 encodeType from the ERC. */
export const SPEND_GRANT_ENCODE_TYPE =
  "SpendGrant(address principal,address delegate,uint8 recipientMode,address recipient,uint8 assetCombine,uint64 windowSeconds,AssetLimit[] assets,uint64 validAfter,uint64 validUntil,uint256 salt,bytes32 renderingHash)AssetLimit(address asset,uint256 maxPerCall,uint256 maxPerWindow,uint256 maxTotal)";

export const ASSET_LIMIT_ENCODE_TYPE =
  "AssetLimit(address asset,uint256 maxPerCall,uint256 maxPerWindow,uint256 maxTotal)";

export const SPEND_GRANT_TYPEHASH = keccak256(toBytes(SPEND_GRANT_ENCODE_TYPE));
export const ASSET_LIMIT_TYPEHASH = keccak256(toBytes(ASSET_LIMIT_ENCODE_TYPE));

export const spendGrantTypes = {
  AssetLimit: [
    { name: "asset", type: "address" },
    { name: "maxPerCall", type: "uint256" },
    { name: "maxPerWindow", type: "uint256" },
    { name: "maxTotal", type: "uint256" },
  ],
  SpendGrant: [
    { name: "principal", type: "address" },
    { name: "delegate", type: "address" },
    { name: "recipientMode", type: "uint8" },
    { name: "recipient", type: "address" },
    { name: "assetCombine", type: "uint8" },
    { name: "windowSeconds", type: "uint64" },
    { name: "assets", type: "AssetLimit[]" },
    { name: "validAfter", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "salt", type: "uint256" },
    { name: "renderingHash", type: "bytes32" },
  ],
} as const;

export interface SpendGrantDomain {
  name: typeof SPEND_GRANT_DOMAIN_NAME;
  version: typeof SPEND_GRANT_DOMAIN_VERSION;
  chainId: bigint;
  verifyingContract: Address;
}

export interface SpendGrantHashes {
  domainSeparator: Hex;
  structHash: Hex;
  digest: Hex;
}

export function spendGrantDomain(input: {
  chainId: bigint;
  revocationRegistry: Address;
}): SpendGrantDomain {
  return {
    name: SPEND_GRANT_DOMAIN_NAME,
    version: SPEND_GRANT_DOMAIN_VERSION,
    chainId: input.chainId,
    verifyingContract: input.revocationRegistry,
  };
}

export function toSpendGrantTypedData(grant: SpendGrant) {
  return {
    principal: grant.principal,
    delegate: grant.delegate,
    recipientMode: grant.recipientMode,
    recipient: grant.recipient,
    assetCombine: grant.assetCombine,
    windowSeconds: grant.windowSeconds,
    assets: grant.assets.map((asset) => ({
      asset: asset.asset,
      maxPerCall: asset.maxPerCall,
      maxPerWindow: asset.maxPerWindow,
      maxTotal: asset.maxTotal,
    })),
    validAfter: grant.validAfter,
    validUntil: grant.validUntil,
    salt: grant.salt,
    renderingHash: grant.renderingHash,
  };
}

export function hashAssetLimit(asset: AssetLimit): Hex {
  return hashStruct({
    types: { AssetLimit: spendGrantTypes.AssetLimit },
    primaryType: "AssetLimit",
    data: {
      asset: asset.asset,
      maxPerCall: asset.maxPerCall,
      maxPerWindow: asset.maxPerWindow,
      maxTotal: asset.maxTotal,
    },
  });
}

/** EIP-712 array of structs: keccak256 of concatenated element hashes, no length. */
export function hashAssetLimitArray(assets: readonly AssetLimit[]): Hex {
  const hashes = assets.map(hashAssetLimit);
  return keccak256(hashes.length === 0 ? "0x" : concatHex(hashes));
}

export function hashSpendGrantDomain(input: {
  chainId: bigint;
  revocationRegistry: Address;
}): Hex {
  return domainSeparator({ domain: spendGrantDomain(input) });
}

export function hashSpendGrantStruct(grant: SpendGrant): Hex {
  return hashStruct({
    types: spendGrantTypes,
    primaryType: "SpendGrant",
    data: toSpendGrantTypedData(grant),
  });
}

export function hashSpendGrantTypedData(
  interchange: SpendGrantInterchange,
): SpendGrantHashes {
  const domain = spendGrantDomain(interchange);
  const message = toSpendGrantTypedData(interchange.grant);
  const domainSeparatorValue = domainSeparator({ domain });
  const structHash = hashStruct({
    types: spendGrantTypes,
    primaryType: "SpendGrant",
    data: message,
  });
  const digest = hashTypedData({
    domain,
    types: spendGrantTypes,
    primaryType: "SpendGrant",
    message,
  });
  const reconstructed = keccak256(
    concatHex(["0x1901", domainSeparatorValue, structHash]),
  );
  if (digest !== reconstructed) {
    throw new Error("grantHash reconstruction does not match hashTypedData");
  }
  return {
    domainSeparator: domainSeparatorValue,
    structHash,
    digest,
  };
}

export function hashSpendGrant(interchange: SpendGrantInterchange): Hex {
  return hashSpendGrantTypedData(interchange).digest;
}
