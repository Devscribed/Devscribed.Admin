namespace Devscribed.Admin.Web.Services;

public static class VacationAccrualCalculator
{
    private const int WorkingDaysPerYear = 260;
    private const int BillableHoursPerYear = 2080;

    public static decimal CalculateFullMonthCredit(decimal clientHourlyRate, decimal vacationReservePercent)
    {
        var expectedMonthlyBilling = clientHourlyRate * BillableHoursPerYear / 12m;
        return Math.Round(expectedMonthlyBilling * vacationReservePercent / 100m, 2, MidpointRounding.AwayFromZero);
    }

    public static decimal CalculateProratedCredit(decimal fullMonthCredit, int workingDaysFromConfig, int workingDaysInMonth)
    {
        if (workingDaysInMonth <= 0)
            return 0m;

        return Math.Round(fullMonthCredit * workingDaysFromConfig / workingDaysInMonth, 2, MidpointRounding.AwayFromZero);
    }

    public static decimal CalculateDailySalary(decimal monthlySalary)
    {
        return monthlySalary * 12m / WorkingDaysPerYear;
    }

    public static int CalculateAvailableDays(decimal reserveBalance, decimal dailySalary, int vacationDaysPerYear, int usedDays)
    {
        if (dailySalary <= 0)
            return 0;

        var fromBalance = (int)Math.Floor(reserveBalance / dailySalary);
        var cap = vacationDaysPerYear - usedDays;
        var days = Math.Min(fromBalance, cap);
        return Math.Max(days, 0);
    }

    public static int CountWeekdays(DateOnly start, DateOnly end)
    {
        if (end < start)
            return 0;

        var count = 0;
        for (var day = start; day <= end; day = day.AddDays(1))
        {
            if (day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
                count++;
        }

        return count;
    }
}
