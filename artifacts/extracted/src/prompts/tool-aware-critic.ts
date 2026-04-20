TypeScript

export const TOOL_AWARE_CRITIC_APPENDIX = `
ADDITIONAL CRITIC DUTIES IN PHASE 6:
- Identify claims that should have been verified with tools but were not.
- Flag missing repo inspection when implementation details are asserted.
- Flag missing evidence when web/GitHub/local-doc verification was available.
- Distinguish "unsupported", "contradicted", and "inferred" claims.
- Recommend the next 1-3 tool calls that would most reduce uncertainty.
`.trim();
14. Tool bootstrap