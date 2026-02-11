import { SpaceshipApiError } from "./spaceship-client.js";

export const toTextResult = (
  text: string,
  structuredContent?: Record<string, unknown>,
) => ({
  content: [{ type: "text" as const, text }],
  ...(structuredContent ? { structuredContent } : {}),
});

const getRecoverySuggestion = (status: number, message: string, details: unknown): string | null => {
  if (status === 429) {
    return "Rate limit exceeded. This endpoint allows 5 requests per 300 seconds per domain. Wait 60 seconds and retry, or batch your operations to reduce API calls.";
  }

  if (status === 404) {
    const lower = message.toLowerCase();
    if (lower.includes("domain")) {
      return "Domain not found. Verify the domain name is correct and exists in your Spaceship account. Use list_domains to see all domains.";
    }
    if (lower.includes("contact")) {
      return "Contact not found. Verify the contact ID is correct. Use save_contact to create a new contact.";
    }
    if (lower.includes("nameserver")) {
      return "Personal nameserver not found. Use list_personal_nameservers to see existing nameservers for this domain.";
    }
    if (lower.includes("sellerhub") || lower.includes("seller")) {
      return "SellerHub listing not found. Verify the domain is listed on SellerHub. Use list_sellerhub_domains to see all listings.";
    }
    if (lower.includes("operation")) {
      return "Async operation not found. The operation ID may have expired. Operations are typically available for 24 hours.";
    }
    return "Resource not found. Verify the identifier is correct and the resource exists in your account.";
  }

  if (status === 400) {
    const detailStr = typeof details === "string" ? details : JSON.stringify(details ?? "");
    const lower = detailStr.toLowerCase();
    if (lower.includes("domain") && lower.includes("invalid")) {
      return "Invalid domain name. Domain must include a TLD (e.g. 'example.com', not 'example'). Ensure it contains only valid characters.";
    }
    if (lower.includes("already exists") || lower.includes("duplicate")) {
      return "This resource already exists. Use the corresponding update or get tool instead of create.";
    }
    if (lower.includes("consent")) {
      return "User consent is required for this operation. Set userConsent to true to proceed.";
    }
    return "Invalid request. Check that all required parameters are provided and in the correct format.";
  }

  if (status === 401 || status === 403) {
    return "Authentication failed. Verify that SPACESHIP_API_KEY and SPACESHIP_API_SECRET environment variables are set correctly and the API credentials have not expired.";
  }

  if (status === 409) {
    return "Conflict — this operation conflicts with the current state of the resource. The resource may have been modified by another process. Fetch the latest state and retry.";
  }

  if (status === 422) {
    return "Validation failed. Check the details for specific field errors and correct the input values.";
  }

  if (status >= 500) {
    return "Spaceship API server error. This is a temporary issue on Spaceship's end. Wait a moment and retry the operation.";
  }

  return null;
};

export const toErrorResult = (error: unknown) => {
  if (error instanceof SpaceshipApiError) {
    const suggestion = getRecoverySuggestion(error.status, error.message, error.details);

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Spaceship API error: ${error.message}`,
            `Status: ${error.status}`,
            error.details ? `Details: ${JSON.stringify(error.details, null, 2)}` : "",
            suggestion ? `\nRecovery: ${suggestion}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
};
