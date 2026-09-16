/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { pgTable, text, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

/**
 * Real Users Table to manage sandboxed/partitioned browser and client sessions
 */
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Universal Key-Value Store for unstructured drafts and layouts
 * Segmented by user_id to prevent collision across different browser/client users.
 */
export const keyValuePairTable = pgTable(
  "key_value_pairs",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.key] }),
    };
  },
);

/**
 * Structured Vendor Register (for W-9 request states and 1099-NEC reviews)
 * Segmented by user_id to isolate records between users.
 */
export const vendorProfilesTable = pgTable(
  "vendor_profiles",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    legalName: text("legal_name").notNull(),
    businessName: text("business_name"),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    zipCode: text("zip_code"),
    entityType: text("entity_type")
      .$type<"Individual" | "LLC" | "Partnership" | "Corporation" | "Unknown">()
      .default("Unknown")
      .notNull(),
    w9Status: text("w9_status")
      .$type<"Not Requested" | "Requested" | "Received" | "Needs Review" | "Not Applicable">()
      .default("Not Requested")
      .notNull(),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.id] }),
    };
  },
);
