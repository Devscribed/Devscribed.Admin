using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Unit;

public class VacationReserveCalculatorTests
{
    // TC-07-UNIT-01: Auto-calculate reserve percentage
    [Theory]
    [InlineData(3000, 40, 20, 3.33)]
    [InlineData(5000, 60, 20, 3.70)]
    [InlineData(2000, 25, 15, 2.66)]
    public void Calculates_reserve_percent_from_salary_rate_and_days(
        decimal monthlySalary, decimal clientHourlyRate, int vacationDaysPerYear, decimal expected)
    {
        var result = VacationReserveCalculator.CalculateReservePercent(monthlySalary, clientHourlyRate, vacationDaysPerYear);

        Assert.Equal(expected, result);
    }
}
