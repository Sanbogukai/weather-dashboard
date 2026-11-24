// The country code pattern, in its own file because both routes.ts and samples.ts check codes,
// and samples.ts loads before routes.ts finishes (routes, owners, samples import in a chain).

// Two capital letters, the ISO 3166-1 alpha-2 country code: it matches "PH" and "CA" and
// rejects "ph", "PHL" and "P1".
// Try it: https://regex101.com/?flavor=javascript&regex=%5E%5BA-Z%5D%7B2%7D%24&testString=PH
export const COUNTRY_CODE = /^[A-Z]{2}$/;
