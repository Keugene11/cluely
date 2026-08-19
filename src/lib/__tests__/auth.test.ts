import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// These exercise the primitives the auth module is built on (bcrypt + jose),
// independent of Next's request/cookie context which can't run under vitest.

describe("password hashing (bcrypt)", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await bcrypt.hash("testpass123", 10);
    expect(hash).not.toBe("testpass123");
    expect(await bcrypt.compare("testpass123", hash)).toBe(true);
    expect(await bcrypt.compare("wrongpass", hash)).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const a = await bcrypt.hash("same", 10);
    const b = await bcrypt.hash("same", 10);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare("same", a)).toBe(true);
    expect(await bcrypt.compare("same", b)).toBe(true);
  });
});

describe("session token (jose)", () => {
  const secret = new TextEncoder().encode("test-secret-at-least-32-bytes-long-xx");

  it("round-trips a signed user id", async () => {
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    const { payload } = await jwtVerify(token, secret);
    expect(payload.sub).toBe("user-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode("some-other-secret-value-32-bytes-xx"));

    await expect(jwtVerify(token, secret)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ sub: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);

    await expect(jwtVerify(token, secret)).rejects.toThrow();
  });
});
