import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { spendGrantTypes, SPEND_GRANT_DOMAIN_NAME, SPEND_GRANT_DOMAIN_VERSION, SPEND_GRANT_ENCODE_TYPE } from "../src/index.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DESCRIPTOR_DIR = join(REPO_ROOT, "descriptors");
const DEPLOYMENTS_DIR = join(REPO_ROOT, "deployments");

interface Field {
  path?: string;
  fields?: Field[];
  visible?: unknown;
  $ref?: string;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

const descriptor = readJson(join(DESCRIPTOR_DIR, "spend-grant.erc7730.json"));
const schema = readJson(join(DESCRIPTOR_DIR, "erc7730-v2.1.0.schema.json"));

/** Flattens the descriptor's field tree into full message paths (`assets.[].maxTotal`). */
function fieldPaths(fields: Field[], prefix = ""): string[] {
  return fields.flatMap((field) => {
    const path = field.path === undefined ? prefix : prefix ? `${prefix}.${field.path}` : field.path;
    return field.fields ? fieldPaths(field.fields, path) : [path];
  });
}

describe("ERC-7730 descriptor", () => {
  it("validates against the ERC-7730 v2.1.0 schema", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    const validate = ajv.compile(schema);
    const ok = validate(descriptor);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("binds the SpendGrant encodeType and domain", () => {
    expect(Object.keys(descriptor.display.formats)).toEqual([SPEND_GRANT_ENCODE_TYPE]);
    expect(descriptor.context.eip712.domain).toEqual({
      name: SPEND_GRANT_DOMAIN_NAME,
      version: SPEND_GRANT_DOMAIN_VERSION,
    });
  });

  it("covers every SpendGrant and AssetLimit field exactly once", () => {
    const format = descriptor.display.formats[SPEND_GRANT_ENCODE_TYPE];
    const covered = fieldPaths(format.fields).sort();
    const expected = spendGrantTypes.SpendGrant.flatMap((member) =>
      member.name === "assets"
        ? spendGrantTypes.AssetLimit.map((a) => `assets.[].${a.name}`)
        : [member.name],
    ).sort();
    expect(covered).toEqual(expected);
  });

  it("pins assetCombine to the only valid value", () => {
    const format = descriptor.display.formats[SPEND_GRANT_ENCODE_TYPE];
    const field = (format.fields as Field[]).find((f) => f.path === "assetCombine");
    expect(field?.visible).toEqual({ mustMatch: [0] });
  });

  it("lists exactly the recorded registry deployments", () => {
    const recorded = readdirSync(DEPLOYMENTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson(join(DEPLOYMENTS_DIR, f)))
      .map((d) => ({ chainId: d.chainId, address: d.registry }))
      .sort((a, b) => a.chainId - b.chainId);
    expect(descriptor.context.eip712.deployments).toEqual(recorded);
  });
});
