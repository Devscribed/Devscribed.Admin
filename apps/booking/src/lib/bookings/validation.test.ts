import { describe, expect, it } from "vitest";

import {
  MAX_CV_BYTES,
  hasErrors,
  isAcceptedCvExtension,
  isValidEmail,
  validateCandidateFields,
  validateCv,
} from "@/lib/bookings/validation";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("jane.doe@example.com")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("jane@")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("CV validation", () => {
  it("accepts allowed extensions (case-insensitive)", () => {
    expect(isAcceptedCvExtension("resume.PDF")).toBe(true);
    expect(isAcceptedCvExtension("cv.docx")).toBe(true);
  });
  it("rejects disallowed extensions", () => {
    expect(isAcceptedCvExtension("resume.pages")).toBe(false);
    expect(isAcceptedCvExtension("noext")).toBe(false);
  });
  it("flags type, size, and emptiness", () => {
    expect(validateCv({ name: "cv.exe", size: 100 })).toMatch(/Unsupported/);
    expect(validateCv({ name: "cv.pdf", size: MAX_CV_BYTES + 1 })).toMatch(
      /too large/,
    );
    expect(validateCv({ name: "cv.pdf", size: 0 })).toMatch(/empty/);
    expect(validateCv({ name: "cv.pdf", size: 1000 })).toBeNull();
    expect(validateCv(null)).toMatch(/attach/);
  });
});

describe("validateCandidateFields", () => {
  const validCv = { name: "cv.pdf", size: 1000 };

  it("passes with all valid fields", () => {
    const errors = validateCandidateFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      cv: validCv,
    });
    expect(hasErrors(errors)).toBe(false);
  });

  it("collects errors for each missing/invalid field", () => {
    const errors = validateCandidateFields({
      firstName: "",
      lastName: " ",
      email: "bad",
      cv: null,
    });
    expect(errors.firstName).toBeDefined();
    expect(errors.lastName).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.cv).toBeDefined();
    expect(hasErrors(errors)).toBe(true);
  });

  it("treats note as optional (not part of validation)", () => {
    const errors = validateCandidateFields({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      cv: validCv,
    });
    expect(errors).toEqual({});
  });
});
