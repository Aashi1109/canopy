import { expect, test, vi, onTestFinished } from "vitest";
import redis from "redis";
import { closeRedis } from "../lib/cache/index.ts";
import { db, rolesTable, userRolesTable } from "../db/index.ts";
import { getRole, listRoles } from "../lib/admin/data.ts";

test("role definitions are cached while membership counts stay current", async () => {
  const originalSelect = db.select;
  const variables = ["REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  onTestFinished(async () => {
    vi.restoreAllMocks();
    await closeRedis();
    db.select = originalSelect;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.REDIS_URL = "redis://cache.example.test:6379";
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
        expect(table).toBe(userRolesTable);
        membershipsRead++;
        return Promise.resolve([{ roleId: "editor", assignedUsers }]).then(resolve, reject);
      },
    };
    return query;
  };
  vi.spyOn(redis, "createClient").mockImplementation(() => ({
    isOpen: false,
    isReady: false,
    on() {
      return this;
    },
    async connect() {
      this.isOpen = this.isReady = true;
      return this;
    },
    async sendCommand(command) {
      expect(command[1]).toBe("roles:all");
      if (command[0] === "GET") return cached;
      expect(command[0]).toBe("SET");
      cached = command[2];
      return 1;
    },
    destroy() {
      this.isOpen = this.isReady = false;
    },
  }));

  expect(await listRoles()).toEqual(roles.map((role) => ({ ...role, assignedUsers: role.id === "editor" ? 1 : 0 })));
  assignedUsers = 4;
  expect(await listRoles()).toEqual(roles.map((role) => ({ ...role, assignedUsers: role.id === "editor" ? 4 : 0 })));
  expect(definitionsRead).toBe(1);
  expect(membershipsRead).toBe(2);
  assignedUsers = 0;
  expect(await getRole("editor")).toEqual({ ...roles[0], assignedUsers: 0 });
  expect(await getRole("missing")).toBe(undefined);
  expect(definitionsRead).toBe(1);

  cached = "{broken";
  const before = definitionsRead;
  expect(await getRole("editor")).toEqual({ ...roles[0], assignedUsers: 0 });
  expect(definitionsRead).toBe(before + 1);
});
