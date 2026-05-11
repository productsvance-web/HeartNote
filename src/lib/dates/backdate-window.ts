// Maximum number of days a vital reading or voice log can be backdated.
// Applied uniformly across /log voice path and /trends per-vital adds so
// caregivers have one consistent horizon. Server-side validation enforces
// this; client UI uses the same constant for date-input min attributes.
//
// 400 days = roughly 13 months: covers a full year of seasonal CHF
// patterns plus a buffer for catch-up entries when the caregiver
// imports historical readings.

export const MAX_BACKDATE_DAYS = 400;
