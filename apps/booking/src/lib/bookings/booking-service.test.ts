import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock, repoMock } = vi.hoisted(() => ({
  storageMock: { save: vi.fn(), read: vi.fn(), delete: vi.fn() },
  repoMock: {
    create: vi.fn(),
    getByToken: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/config", () => ({
  getHiringManagerEmail: () => "dima@devscribed.com",
}));
vi.mock("@/lib/graph/event-service", () => ({
  isSlotFree: vi.fn(),
  createBookingEvent: vi.fn(),
  deleteBookingEvent: vi.fn(),
}));
vi.mock("@/lib/storage/cv-storage", () => ({ getCvStorage: () => storageMock }));
vi.mock("@/lib/bookings/repository", () => ({
  getBookingRepository: () => repoMock,
}));

import {
  BookingFailedError,
  SlotTakenError,
  createBooking,
  type CreateBookingInput,
} from "@/lib/bookings/booking-service";
import {
  createBookingEvent,
  deleteBookingEvent,
  isSlotFree,
} from "@/lib/graph/event-service";

const mockedIsSlotFree = vi.mocked(isSlotFree);
const mockedCreateEvent = vi.mocked(createBookingEvent);
const mockedDeleteEvent = vi.mocked(deleteBookingEvent);

function makeInput(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    interview: {
      slug: "30-min",
      name: "30-minutes interview",
      durationMinutes: 30,
    },
    startUtc: DateTime.utc().plus({ days: 2 }).set({ second: 0, millisecond: 0 }).toISO()!,
    timeZone: "America/Los_Angeles",
    candidate: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    cv: {
      fileName: "cv.pdf",
      contentType: "application/pdf",
      data: Buffer.from("hello"),
    },
    baseUrl: "https://book.example.com",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.save.mockResolvedValue(undefined);
  storageMock.delete.mockResolvedValue(undefined);
  repoMock.create.mockResolvedValue(undefined);
  mockedIsSlotFree.mockResolvedValue(true);
  mockedCreateEvent.mockResolvedValue("evt-1");
  mockedDeleteEvent.mockResolvedValue(undefined);
});

describe("createBooking", () => {
  it("books successfully and persists a confirmed record", async () => {
    const record = await createBooking(makeInput());

    expect(record.status).toBe("confirmed");
    expect(record.graphEventId).toBe("evt-1");
    expect(record.token).toBeTruthy();
    expect(record.cv.storageKey.endsWith(".pdf")).toBe(true);
    expect(storageMock.save).toHaveBeenCalledOnce();
    expect(mockedCreateEvent).toHaveBeenCalledOnce();
    expect(repoMock.create).toHaveBeenCalledOnce();
    expect(mockedDeleteEvent).not.toHaveBeenCalled();
  });

  it("throws SlotTakenError and touches nothing when the slot is taken", async () => {
    mockedIsSlotFree.mockResolvedValue(false);

    await expect(createBooking(makeInput())).rejects.toBeInstanceOf(
      SlotTakenError,
    );
    expect(storageMock.save).not.toHaveBeenCalled();
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it("rejects a past start as SlotTakenError before hitting the calendar", async () => {
    const past = DateTime.utc().minus({ days: 1 }).toISO()!;

    await expect(
      createBooking(makeInput({ startUtc: past })),
    ).rejects.toBeInstanceOf(SlotTakenError);
    expect(mockedIsSlotFree).not.toHaveBeenCalled();
  });

  it("rolls back the stored CV when event creation fails", async () => {
    mockedCreateEvent.mockRejectedValue(new Error("graph down"));

    await expect(createBooking(makeInput())).rejects.toBeInstanceOf(
      BookingFailedError,
    );
    expect(storageMock.save).toHaveBeenCalledOnce();
    expect(storageMock.delete).toHaveBeenCalledOnce();
    expect(mockedDeleteEvent).not.toHaveBeenCalled();
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it("rolls back the event and CV when persistence fails", async () => {
    repoMock.create.mockRejectedValue(new Error("db down"));

    await expect(createBooking(makeInput())).rejects.toBeInstanceOf(
      BookingFailedError,
    );
    expect(mockedDeleteEvent).toHaveBeenCalledWith(
      "dima@devscribed.com",
      "evt-1",
    );
    expect(storageMock.delete).toHaveBeenCalledOnce();
  });
});
