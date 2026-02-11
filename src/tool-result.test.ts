import { describe, it, expect } from "vitest";
import { toTextResult, toErrorResult } from "./tool-result.js";
import { SpaceshipApiError } from "./spaceship-client.js";

describe("toTextResult", () => {
  it("returns text content", () => {
    const result = toTextResult("hello");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("includes structured content when provided", () => {
    const result = toTextResult("hello", { key: "value" });
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
      structuredContent: { key: "value" },
    });
  });

  it("omits structuredContent when not provided", () => {
    const result = toTextResult("hello");
    expect(result).not.toHaveProperty("structuredContent");
  });
});

describe("toErrorResult", () => {
  it("formats SpaceshipApiError with status and details", () => {
    const error = new SpaceshipApiError("Not found", 404, { code: "DOMAIN_NOT_FOUND" });
    const result = toErrorResult(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Spaceship API error");
    expect(result.content[0].text).toContain("404");
    expect(result.content[0].text).toContain("DOMAIN_NOT_FOUND");
  });

  it("formats SpaceshipApiError without details", () => {
    const error = new SpaceshipApiError("Bad request", 400);
    const result = toErrorResult(error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("400");
    expect(result.content[0].text).not.toContain("Details:");
  });

  it("formats generic Error", () => {
    const result = toErrorResult(new Error("something broke"));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("something broke");
  });

  it("formats non-Error values", () => {
    const result = toErrorResult("string error");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("string error");
  });

  it("includes rate limit recovery suggestion for 429", () => {
    const error = new SpaceshipApiError("Rate limit exceeded", 429);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("5 requests per 300 seconds");
  });

  it("includes domain not found recovery suggestion for 404 with domain context", () => {
    const error = new SpaceshipApiError("Domain not found", 404);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("list_domains");
  });

  it("includes contact not found recovery suggestion for 404 with contact context", () => {
    const error = new SpaceshipApiError("Contact not found", 404);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("save_contact");
  });

  it("includes auth recovery suggestion for 401", () => {
    const error = new SpaceshipApiError("Unauthorized", 401);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("SPACESHIP_API_KEY");
  });

  it("includes auth recovery suggestion for 403", () => {
    const error = new SpaceshipApiError("Forbidden", 403);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("SPACESHIP_API_SECRET");
  });

  it("includes validation recovery suggestion for 400 with invalid domain", () => {
    const error = new SpaceshipApiError("Bad request", 400, "invalid domain name");
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("TLD");
  });

  it("includes conflict recovery suggestion for 409", () => {
    const error = new SpaceshipApiError("Conflict", 409);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("Fetch the latest state");
  });

  it("includes server error recovery suggestion for 500", () => {
    const error = new SpaceshipApiError("Internal server error", 500);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("temporary issue");
  });

  it("includes sellerhub not found recovery suggestion", () => {
    const error = new SpaceshipApiError("SellerHub listing not found", 404);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("list_sellerhub_domains");
  });

  it("includes generic 400 recovery suggestion for unspecific errors", () => {
    const error = new SpaceshipApiError("Bad request", 400);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("required parameters");
  });

  it("includes validation recovery suggestion for 422", () => {
    const error = new SpaceshipApiError("Validation failed", 422, { field: "email" });
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("field errors");
  });

  it("includes nameserver not found recovery suggestion for 404", () => {
    const error = new SpaceshipApiError("Nameserver not found", 404);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("list_personal_nameservers");
  });

  it("includes operation not found recovery suggestion for 404", () => {
    const error = new SpaceshipApiError("Operation not found", 404);
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("operation ID may have expired");
  });

  it("includes duplicate resource recovery suggestion for 400", () => {
    const error = new SpaceshipApiError("Bad request", 400, "Resource already exists");
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("update or get tool");
  });

  it("includes consent recovery suggestion for 400", () => {
    const error = new SpaceshipApiError("Bad request", 400, "User consent is required");
    const result = toErrorResult(error);

    expect(result.content[0].text).toContain("Recovery:");
    expect(result.content[0].text).toContain("userConsent");
  });

  it("returns no recovery suggestion for unrecognized status codes", () => {
    const error = new SpaceshipApiError("I'm a teapot", 418);
    const result = toErrorResult(error);

    expect(result.content[0].text).not.toContain("Recovery:");
  });
});
