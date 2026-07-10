namespace Devscribed.Admin.Web.Services;

public static class VacationReserveCalculator
{
    private const int WorkingDaysPerYear = 260;
    private const int BillableHoursPerYear = 2080;

    public static decimal CalculateReservePercent(decimal monthlySalary, decimal clientHourlyRate, int vacationDaysPerYear)
    {
        var dailySalary = monthlySalary * 12 / WorkingDaysPerYear;
        var annualVacationCost = dailySalary * vacationDaysPerYear;
        var expectedAnnualBilling = clientHourlyRate * BillableHoursPerYear;
        var percent = annualVacationCost / expectedAnnualBilling * 100;
        return Math.Round(percent, 2, MidpointRounding.AwayFromZero);
    }
}
