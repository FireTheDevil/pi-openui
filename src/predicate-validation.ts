// Boolean guards discard diagnostics, so formatting must not inspect opaque input.
export const predicateParseContext = { error: () => "Invalid input" };
