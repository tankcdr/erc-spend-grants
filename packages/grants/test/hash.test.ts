import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ASSET_COMBINE_AND,
  ASSET_COMBINE_OR,
  ASSET_LIMIT_ENCODE_TYPE,
  ASSET_LIMIT_TYPEHASH,
  defineSpendGrant,
  getRenderingHash,
  hashAssetLimitArray,
  hashSpendGrant,
  hashSpendGrantStruct,
  hashSpendGrantTypedData,
  SPEND_GRANT_ENCODE_TYPE,
  SPEND_GRANT_TYPEHASH,
  spendGrantDomain,
  spendGrantTypes,
  parseSpendGrant,
  RECIPIENT_MODE_ANY,
  RECIPIENT_MODE_LOCKED,
  renderSpendGrant,
  toSpendGrantJson,
  toSpendGrantTypedData,
  NATIVE_ADDRESS,
  ZERO_ADDRESS,
  type SpendGrant,
  type SpendGrantInterchange,
} from "../src/index.js";

const VECTOR_PATH = resolve(fileURLToPath(new URL("../../../vectors/v1.json", import.meta.url)));

const CHAIN_ID = 31337n;
const REGISTRY =
  "0x4444444444444444444444444444444444444444" as Address;
const PRINCIPAL =
  "0x1111111111111111111111111111111111111111" as Address;
const DELEGATE =
  "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT =
  "0x3333333333333333333333333333333333333333" as Address;
const TOKEN_A =
  "0x00000000000000000000000000000000000000a0" as Address;
const TOKEN_B =
  "0x00000000000000000000000000000000000000b0" as Address;

const VECTOR_NAMES = [
  "one-asset-locked-recipient",
  "two-asset-and-native-erc20",
  "two-asset-or",
  "eoa-signed",
] as const;

/** Anvil account 0. Evidence only; not a trusted deployment. */
const EOA_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const EOA = privateKeyToAccount(EOA_KEY);
const EOA_ADDRESS = EOA.address.toLowerCase() as Address;

interface GoldenVector {
  name: string;
  chainId: string;
  revocationRegistry: string;
  grant: Record<string, unknown>;
  domainSeparator: Hex;
  structHash: Hex;
  digest: Hex;
  rendering: string;
  renderingHash: Hex;
  signature?: Hex;
  signer?: Address;
}

interface VectorFile {
  version: number;
  encodeType: string;
  domain: { name: string; version: string };
  vectors: GoldenVector[];
}

function asset(
  token: Address,
  maxPerCall: bigint,
  maxPerWindow: bigint,
  maxTotal: bigint,
) {
  return { asset: token, maxPerCall, maxPerWindow, maxTotal };
}

function fixtures(): Record<(typeof VECTOR_NAMES)[number], SpendGrantInterchange> {
  return {
    "one-asset-locked-recipient": defineSpendGrant({
      chainId: CHAIN_ID,
      revocationRegistry: REGISTRY,
      grant: {
        principal: PRINCIPAL,
        delegate: DELEGATE,
        recipientMode: RECIPIENT_MODE_LOCKED,
        recipient: RECIPIENT,
        assetCombine: ASSET_COMBINE_AND,
        windowSeconds: 86400n,
        assets: [asset(TOKEN_A, 10n, 100n, 1000n)],
        validAfter: 1_700_000_000n,
        validUntil: 1_800_000_000n,
        salt: 1n,
      },
    }),
    "two-asset-and-native-erc20": defineSpendGrant({
      chainId: CHAIN_ID,
      revocationRegistry: REGISTRY,
      grant: {
        principal: PRINCIPAL,
        delegate: DELEGATE,
        recipientMode: RECIPIENT_MODE_ANY,
        recipient: ZERO_ADDRESS,
        assetCombine: ASSET_COMBINE_AND,
        windowSeconds: 86400n,
        assets: [
          asset(TOKEN_A, 10n, 100n, 1000n),
          asset(NATIVE_ADDRESS, 1n, 5n, 20n),
        ],
        validAfter: 1_700_000_000n,
        validUntil: 1_800_000_000n,
        salt: 2n,
      },
    }),
    "two-asset-or": defineSpendGrant({
      chainId: CHAIN_ID,
      revocationRegistry: REGISTRY,
      grant: {
        principal: PRINCIPAL,
        delegate: DELEGATE,
        recipientMode: RECIPIENT_MODE_LOCKED,
        recipient: RECIPIENT,
        assetCombine: ASSET_COMBINE_OR,
        windowSeconds: 86400n,
        assets: [
          asset(TOKEN_A, 10n, 100n, 1000n),
          asset(TOKEN_B, 20n, 200n, 2000n),
        ],
        validAfter: 1_700_000_000n,
        validUntil: 1_800_000_000n,
        salt: 3n,
      },
    }),
    "eoa-signed": defineSpendGrant({
      chainId: CHAIN_ID,
      revocationRegistry: REGISTRY,
      grant: {
        principal: EOA_ADDRESS,
        delegate: DELEGATE,
        recipientMode: RECIPIENT_MODE_LOCKED,
        recipient: RECIPIENT,
        assetCombine: ASSET_COMBINE_AND,
        windowSeconds: 86400n,
        assets: [asset(TOKEN_A, 10n, 100n, 1000n)],
        validAfter: 1_700_000_000n,
        validUntil: 1_800_000_000n,
        salt: 4n,
      },
    }),
  };
}

function independentStructHash(grant: SpendGrant): Hex {
  const elementHashes = grant.assets.map((item) =>
    keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
        ],
        [
          ASSET_LIMIT_TYPEHASH,
          item.asset,
          item.maxPerCall,
          item.maxPerWindow,
          item.maxTotal,
        ],
      ),
    ),
  );
  const assetsHash = keccak256(concatHex(elementHashes));
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint8" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        SPEND_GRANT_TYPEHASH,
        grant.principal,
        grant.delegate,
        grant.recipientMode,
        grant.recipient,
        grant.assetCombine,
        grant.windowSeconds,
        assetsHash,
        grant.validAfter,
        grant.validUntil,
        grant.salt,
        grant.renderingHash,
      ],
    ),
  );
}

function goldenFromInterchange(
  name: string,
  interchange: SpendGrantInterchange,
): GoldenVector {
  const hashes = hashSpendGrantTypedData(interchange);
  const rendering = renderSpendGrant(interchange);
  const json = toSpendGrantJson(interchange);
  return {
    name,
    chainId: json.chainId,
    revocationRegistry: json.revocationRegistry,
    grant: json.grant,
    domainSeparator: hashes.domainSeparator,
    structHash: hashes.structHash,
    digest: hashes.digest,
    rendering,
    renderingHash: interchange.grant.renderingHash,
  };
}

async function generateVectorFile(): Promise<VectorFile> {
  const generated = fixtures();
  const vectors: GoldenVector[] = [];
  for (const name of VECTOR_NAMES) {
    const vector = goldenFromInterchange(name, generated[name]);
    if (name === "eoa-signed") {
      vector.signer = EOA_ADDRESS;
      vector.signature = await EOA.signTypedData({
        domain: spendGrantDomain(generated[name]),
        types: spendGrantTypes,
        primaryType: "SpendGrant",
        message: toSpendGrantTypedData(generated[name].grant),
      });
    }
    vectors.push(vector);
  }
  return {
    version: 1,
    encodeType: SPEND_GRANT_ENCODE_TYPE,
    domain: { name: "SpendGrant", version: "1" },
    vectors,
  };
}

async function loadOrWriteVectors(): Promise<VectorFile> {
  if (!existsSync(VECTOR_PATH)) {
    mkdirSync(dirname(VECTOR_PATH), { recursive: true });
    const generated = await generateVectorFile();
    writeFileSync(VECTOR_PATH, `${JSON.stringify(generated, null, 2)}\n`);
    return generated;
  }
  return JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as VectorFile;
}

function findHashHarness(): string | undefined {
  const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const candidates = [
    "out/HashHarness.sol/HashHarness.json",
    "out/HashHarness.json",
  ];
  for (const relative of candidates) {
    const path = resolve(repoRoot, relative);
    if (existsSync(path)) return path;
  }
  return undefined;
}

describe("spend grant hashing", () => {
  it("locks the ERC encodeType string", () => {
    expect(SPEND_GRANT_ENCODE_TYPE).toBe(
      "SpendGrant(address principal,address delegate,uint8 recipientMode,address recipient,uint8 assetCombine,uint64 windowSeconds,AssetLimit[] assets,uint64 validAfter,uint64 validUntil,uint256 salt,bytes32 renderingHash)AssetLimit(address asset,uint256 maxPerCall,uint256 maxPerWindow,uint256 maxTotal)",
    );
    expect(ASSET_LIMIT_ENCODE_TYPE).toBe(
      "AssetLimit(address asset,uint256 maxPerCall,uint256 maxPerWindow,uint256 maxTotal)",
    );
    expect(SPEND_GRANT_TYPEHASH).toBe(keccak256(toBytes(SPEND_GRANT_ENCODE_TYPE)));
  });

  it("matches golden vectors and independent EIP-712 reconstruction", async () => {
    const file = await loadOrWriteVectors();
    expect(file.encodeType).toBe(SPEND_GRANT_ENCODE_TYPE);
    expect(file.vectors.map((vector) => vector.name)).toEqual([...VECTOR_NAMES]);

    const generated = fixtures();
    for (const vector of file.vectors) {
      const interchange = parseSpendGrant(
        JSON.stringify({
          chainId: vector.chainId,
          revocationRegistry: vector.revocationRegistry,
          grant: vector.grant,
        }),
      );
      const hashes = hashSpendGrantTypedData(interchange);
      const rendering = renderSpendGrant(interchange);

      expect(rendering).toBe(vector.rendering);
      expect(rendering.endsWith("\n")).toBe(true);
      expect(rendering.endsWith("\n\n")).toBe(false);
      expect(getRenderingHash(interchange)).toBe(vector.renderingHash);
      expect(interchange.grant.renderingHash).toBe(vector.renderingHash);
      expect(hashes.domainSeparator).toBe(vector.domainSeparator);
      expect(hashes.structHash).toBe(vector.structHash);
      expect(hashes.digest).toBe(vector.digest);
      expect(hashSpendGrant(interchange)).toBe(vector.digest);
      expect(hashSpendGrantStruct(interchange.grant)).toBe(vector.structHash);
      expect(independentStructHash(interchange.grant)).toBe(vector.structHash);
      expect(hashAssetLimitArray(interchange.grant.assets)).toBe(
        keccak256(
          concatHex(
            interchange.grant.assets.map((item) =>
              keccak256(
                encodeAbiParameters(
                  [
                    { type: "bytes32" },
                    { type: "address" },
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "uint256" },
                  ],
                  [
                    ASSET_LIMIT_TYPEHASH,
                    item.asset,
                    item.maxPerCall,
                    item.maxPerWindow,
                    item.maxTotal,
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      const local = generated[vector.name as (typeof VECTOR_NAMES)[number]];
      expect(hashSpendGrant(local)).toBe(vector.digest);
      expect(renderSpendGrant(local)).toBe(vector.rendering);
      if (vector.name === "eoa-signed") {
        expect(vector.signer).toBe(EOA_ADDRESS);
        expect(vector.signature).toMatch(/^0x[0-9a-f]{130}$/);
      }
    }
  });

  it("optionally compares HashHarness ABI when the artifact exists", () => {
    const artifactPath = findHashHarness();
    if (!artifactPath) return;
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      abi: Array<{ type: string; name?: string }>;
    };
    const names = new Set(
      artifact.abi
        .filter((item) => item.type === "function")
        .map((item) => item.name),
    );
    expect(
      names.has("digest") || names.has("hashStruct") || names.has("hashSpendGrant"),
    ).toBe(true);
  });
});
