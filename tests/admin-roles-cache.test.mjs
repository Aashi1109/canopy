import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { db, rolesTable, userRolesTable } from "@canopy/database";
import { getRole, listRoles } from "../lib/admin/data.ts";

test("role definitions are cached while membership counts stay current", async (t) => {
  const originalSelect = db.select;
  const originalPost = axios.post;
  const variables = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = variables.map((key) => process.env[key]);
  t.after(() => {
    db.select = originalSelect;
    axios.post = originalPost;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const roles = [
    {
      id: "editor",
      name: "Editor",
      description: "Edit tools",
      access: { tools: { view: true, edit: true } },
      isSystem: false,
    },
    {
      id: "admin",
      name: "Admin",
      description: "Admin access",
      access: { admin: { enter: true } },
      isSystem: true,
    },
  ];
  let definitionsRead = 0;
  let membershipsRead = 0;
  let assignedUsers = 1;
  let cached = null;
  db.select = () => {
    let table;
    const query = {
      from(value) {
        table = value;
        return query;
      },
      groupBy() {
        return query;
      },
      orderBy() {
        return query;
      },
      then(resolve, reject) {
        if (table === rolesTable) {
          definitionsRead++;
          return Promise.resolve(structuredClone(roles)).then(resolve, reject);
        }
        assert.equal(table, userRolesTable);
        membershipsRead++;
        return Promise.resolve([{ roleId: "editor", assignedUsers }]).then(resolve, reject);
      },
    };
    return query;
  };
  axios.post = async (_url, command) => {
    assert.equal(command[1], "roles:all");
    if (command[0] === "GET") return { data: { result: cached } };
    assert.equal(command[0], "SET");
    cached = command[2];
    return { data: { result: 1 } };
  };

  assert.deepEqual(
    await listRoles(),
    roles.map((role) => ({ ...role, assignedUsers: role.id === "editor" ? 1 : 0 })),
  );
  assignedUsers = 4;
  assert.deepEqual(
    await listRoles(),
    roles.map((role) => ({ ...role, assignedUsers: role.id === "editor" ? 4 : 0 })),
  );
  assert.equal(definitionsRead, 1);
  assert.equal(membershipsRead, 2);
  assignedUsers = 0;
  assert.deepEqual(await getRole("editor"), { ...roles[0], assignedUsers: 0 });
  assert.equal(await getRole("missing"), undefined);
  assert.equal(definitionsRead, 1);

  cached = "{broken";
  const before = definitionsRead;
  assert.deepEqual(await getRole("editor"), { ...roles[0], assignedUsers: 0 });
  assert.equal(definitionsRead, before + 1);
});
