using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Unit;

public class VacationAccrualCalculatorTests
{
    // TC-08-UNIT-01: Auto-accrual credit calculation (full month)
    [Theory]
    [InlineData(40, 3.33, 230.88)]
    [InlineData(60, 5.00, 520.00)]
    public void Calculates_full_month_credit(decimal clientHourlyRate, decimal vacationReservePercent, decimal expected)
    {
        var result = VacationAccrualCalculator.CalculateFullMonthCredit(clientHourlyRate, vacationReservePercent);

        Assert.Equal(expected, result);
    }

    // TC-08-UNIT-01 (step 3): pro-rated credit
    [Fact]
    public void Prorates_credit_by_working_days()
    {
        var fullCredit = 230.88m;

        var result = VacationAccrualCalculator.CalculateProratedCredit(fullCredit, workingDaysFromConfig: 10, workingDaysInMonth: 22);

        Assert.Equal(104.95m, result);
    }

    // TC-08-UNIT-02: Available days calculation
    [Theory]
    [InlineData(1661.54, 138.46, 20, 0, 12)]
    [InlineData(0, 138.46, 20, 0, 0)]
    [InlineData(2769.23, 138.46, 20, 18, 2)]
    [InlineData(-100, 138.46, 20, 0, 0)]
    public void Calculates_available_days(decimal reserveBalance, decimal dailySalary, int vacationDaysPerYear, int usedDays, int expected)
    {
        var result = VacationAccrualCalculator.CalculateAvailableDays(reserveBalance, dailySalary, vacationDaysPerYear, usedDays);

        Assert.Equal(expected, result);
    }
}
