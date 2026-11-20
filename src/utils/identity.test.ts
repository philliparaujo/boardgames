import { getPlayer, login, playerIdError } from "./identity";

beforeEach(() => sessionStorage.clear());

it("keeps the tab's id when no custom id is given", () => {
  const first = login("Ada");
  expect(login("Ada Lovelace").id).toBe(first.id);
});

it("uses a custom id, trimmed", () => {
  expect(login("Ada", "  ada-42 ")).toEqual({ id: "ada-42", name: "Ada" });
  expect(getPlayer()).toEqual({ id: "ada-42", name: "Ada" });
  // A blank custom id keeps the current one.
  expect(login("Ada", "   ").id).toBe("ada-42");
});

it("rejects ids with spaces or that are too long", () => {
  expect(playerIdError("ada 42")).toMatch(/spaces/);
  expect(playerIdError("x".repeat(65))).toMatch(/at most/);
  expect(() => login("Ada", "ada 42")).toThrow(/spaces/);
});
