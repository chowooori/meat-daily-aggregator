import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/production/route";

function post(body: string): Request {
  return new Request("http://localhost/api/production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/production", () => {
  it("rejects a body that is not JSON", async () => {
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
  });

  it("rejects too many rows", async () => {
    const rows = Array.from({ length: 1001 }, () => ({}));
    const res = await POST(post(JSON.stringify({ reportDate: "2026-09-17", rows })));
    expect(res.status).toBe(413);
  });

  it("rejects a missing report date", async () => {
    const res = await POST(post(JSON.stringify({ rows: [] })));
    expect(res.status).toBe(400);
  });
});
