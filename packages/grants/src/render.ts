import { keccak256, toBytes, type Address, type Hex } from "viem";

import type {
  SpendGrant,
  SpendGrantInterchange,
  SpendGrantWithoutRenderingHash,
} from "./types.js";

export interface RenderInput {
  chainId: bigint;
  revocationRegistry: Address;
  grant: SpendGrantWithoutRenderingHash | SpendGrant;
}

function addr(value: string): string {
  return value.toLowerCase();
}

export function renderSpendGrant(input: RenderInput): string {
  const { grant } = input;
  const lines = [
    "Spend grant v1",
    `Chain: ${input.chainId}`,
    `Revocation registry: ${addr(input.revocationRegistry)}`,
    `Principal: ${addr(grant.principal)}`,
    `Delegate: ${addr(grant.delegate)}`,
    `Recipient mode: ${grant.recipientMode}`,
    `Recipient: ${addr(grant.recipient)}`,
    `Asset combine: ${grant.assetCombine}`,
    `Window seconds: ${grant.windowSeconds}`,
    `Budget count: ${grant.assets.length}`,
  ];
  grant.assets.forEach((asset, index) => {
    lines.push(
      `Budget ${index} asset: ${addr(asset.asset)}`,
      `Budget ${index} maximum per call (raw units): ${asset.maxPerCall}`,
      `Budget ${index} maximum per window (raw units): ${asset.maxPerWindow}`,
      `Budget ${index} maximum total (raw units): ${asset.maxTotal}`,
    );
  });
  lines.push(
    `Valid after (inclusive Unix seconds): ${grant.validAfter}`,
    `Valid until (exclusive Unix seconds): ${grant.validUntil}`,
    `Salt: ${grant.salt}`,
    "",
  );
  return lines.join("\n");
}

export function getRenderingHash(input: RenderInput): Hex {
  return keccak256(toBytes(renderSpendGrant(input)));
}

export function withRenderingHash(input: RenderInput): SpendGrantInterchange {
  return {
    chainId: input.chainId,
    revocationRegistry: input.revocationRegistry,
    grant: {
      ...input.grant,
      renderingHash: getRenderingHash(input),
    },
  };
}
