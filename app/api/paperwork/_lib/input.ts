export const MAX_API_JSON_BYTES = 3 * 1024 * 1024;

export class ApiInputError extends Error {
  readonly status: 400 | 413;

  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.status = status;
  }
}

const ENTITY_TYPES = ["Individual", "LLC", "Partnership", "Corporation", "Unknown"] as const;
const W9_STATUSES = [
  "Not Requested",
  "Requested",
  "Received",
  "Needs Review",
  "Not Applicable",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];
type W9Status = (typeof W9_STATUSES)[number];

export type NormalizedVendor = {
  id: string;
  legalName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  entityType: EntityType;
  w9Status: W9Status;
  notes: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertJsonPayloadSize(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ApiInputError("API payload is invalid.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_API_JSON_BYTES) {
    throw new ApiInputError("API payload is too large.", 413);
  }
}

export function assertRequestContentLength(value: string | null): void {
  if (value === null) return;
  const length = Number(value);
  if (Number.isFinite(length) && length > MAX_API_JSON_BYTES) {
    throw new ApiInputError("API payload is too large.", 413);
  }
}

function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiInputError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApiInputError(`${label} is too long.`);
  }
  return normalized || null;
}

function enumValue<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiInputError(`${label} is invalid.`);
  }
  return value as T;
}

export function normalizeVendorPayload(value: unknown): NormalizedVendor[] {
  if (!isRecord(value) || !Array.isArray(value.vendors)) {
    throw new ApiInputError("Vendor payload must contain a vendor array.");
  }
  if (value.vendors.length > 1_000) {
    throw new ApiInputError("Vendor payload contains too many records.");
  }

  return value.vendors.map((vendor, index) => {
    if (!isRecord(vendor)) {
      throw new ApiInputError(`Vendor ${index + 1} is invalid.`);
    }
    if (typeof vendor.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(vendor.id)) {
      throw new ApiInputError(`Vendor ${index + 1} has an invalid id.`);
    }
    if (typeof vendor.legalName !== "string") {
      throw new ApiInputError(`Vendor ${index + 1} needs a legal name.`);
    }
    const legalName = vendor.legalName.trim();
    if (!legalName || legalName.length > 200) {
      throw new ApiInputError(`Vendor ${index + 1} has an invalid legal name.`);
    }

    return {
      id: vendor.id,
      legalName,
      businessName: optionalString(vendor.businessName, "Business name", 200),
      email: optionalString(vendor.email, "Email", 320),
      phone: optionalString(vendor.phone, "Phone", 64),
      addressLine1: optionalString(vendor.addressLine1, "Address", 500),
      city: optionalString(vendor.city, "City", 120),
      state: optionalString(vendor.state, "State", 120),
      zipCode: optionalString(vendor.zipCode, "Postal code", 32),
      entityType: enumValue(vendor.entityType, "Entity type", ENTITY_TYPES, "Unknown"),
      w9Status: enumValue(vendor.w9Status, "W-9 status", W9_STATUSES, "Not Requested"),
      notes: optionalString(vendor.notes, "Notes", 2_000),
    };
  });
}
