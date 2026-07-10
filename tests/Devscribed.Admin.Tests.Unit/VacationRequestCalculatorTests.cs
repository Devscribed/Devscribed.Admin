using Devscribed.Admin.Web.Services;
using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class VacationRequestCalculatorTests
{
    // TC-09-UNIT-01: Working days calculation
    [Theory]
    [InlineData("2025-07-14", "2025-07-25", 10)]
    [InlineData("2025-07-14", "2025-07-14", 1)]
    [InlineData("2025-07-12", "2025-07-13", 0)]
    [InlineData("2025-12-29", "2026-01-02", 5)]
    public void Counts_weekdays_inclusive(string start, string end, int expected)
    {
        var result = VacationAccrualCalculator.CountWeekdays(DateOnly.Parse(start), DateOnly.Parse(end));

        Assert.Equal(expected, result);
    }

    // TC-09-UNIT-02: Available days with pending hold
    [Theory]
    [InlineData(1661.54, 1384.62, 138.46, 20, 5, 2)]
    [InlineData(1661.54, 0, 138.46, 20, 5, 12)]
    [InlineData(2769.23, 0, 138.46, 20, 18, 2)]
    public void Calculates_available_days_with_pending_hold(
        decimal reserveBalance, decimal pendingHold, decimal dailySalary, int vacationDaysPerYear, int usedDays, int expected)
    {
        var result = VacationAccrualCalculator.CalculateAvailableDays(reserveBalance, dailySalary, vacationDaysPerYear, usedDays, pendingHold);

        Assert.Equal(expected, result);
    }

    // TC-09-UNIT-03: Overlap detection
    [Theory]
    [InlineData("2025-07-18", "2025-07-25", true)]   // shares last day of A
    [InlineData("2025-07-21", "2025-07-25", false)]  // no overlap
    [InlineData("2025-07-10", "2025-07-16", true)]   // overlaps start of A
    [InlineData("2025-07-15", "2025-07-17", true)]   // fully inside A
    public void Detects_overlap_against_existing_request(string otherStart, string otherEnd, bool expectedOverlap)
    {
        var aStart = DateOnly.Parse("2025-07-14");
        var aEnd = DateOnly.Parse("2025-07-18");

        var result = VacationRequestValidator.Overlaps(aStart, aEnd, DateOnly.Parse(otherStart), DateOnly.Parse(otherEnd));

        Assert.Equal(expectedOverlap, result);
    }

    [Fact]
    public void Cross_year_dates_are_detected()
    {
        Assert.True(VacationRequestValidator.IsCrossYear(DateOnly.Parse("2025-12-29"), DateOnly.Parse("2026-01-02")));
        Assert.False(VacationRequestValidator.IsCrossYear(DateOnly.Parse("2025-07-14"), DateOnly.Parse("2025-07-25")));
    }
}
