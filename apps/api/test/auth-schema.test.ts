import { getAuthTables } from "better-auth/db";
import { admin, username } from "better-auth/plugins";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { accounts, sessions, users, verifications } from "../src/db/schema/index.js";

// Must match the plugins passed to betterAuth() in Phase 1.3.
const authTables = getAuthTables({ plugins: [username(), admin()] });

const drizzleTables = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
};

describe("Better Auth schema", () => {
  it.each(Object.entries(drizzleTables))(
    "the %s table has every field Better Auth needs",
    (model, table) => {
      const expected = authTables[model]?.fields;
      if (!expected) throw new Error(`Better Auth has no ${model} model`);

      const columns = getTableColumns(table);
      for (const [field, definition] of Object.entries(expected)) {
        const column = Object.hasOwn(columns, field)
          ? columns[field as keyof typeof columns]
          : undefined;
        expect(column, `${model}.${field} is missing`).toBeDefined();
        // A field Better Auth may leave empty must not be NOT NULL without a default.
        if (column && !definition.required && column.notNull) {
          expect(column.hasDefault, `${model}.${field} is NOT NULL without a default`).toBe(true);
        }
      }
    },
  );
});
