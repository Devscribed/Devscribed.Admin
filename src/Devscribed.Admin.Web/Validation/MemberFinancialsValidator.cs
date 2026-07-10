namespace Devscribed.Admin.Web.Validation;

public static class MemberFinancialsValidator
{
    private static readonly HashSet<string> ValidCurrencyCodes = new(StringComparer.Ordinal)
    {
        "USD", "EUR", "GBP", "PLN", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK",
        "DKK", "CZK", "HUF", "RON", "BGN", "UAH", "TRY", "CNY", "INR", "BRL",
    };

    public static string? ValidateMonthlySalary(decimal? value)
    {
        if (value is null) return "Monthly salary must be between 0.01 and 999,999.99";
        return value is >= 0.01m and <= 999999.99m ? null : "Monthly salary must be between 0.01 and 999,999.99";
    }

    public static string? ValidateClientHourlyRate(decimal? value)
    {
        if (value is null) return "Client hourly rate must be between 0.01 and 9,999.99";
        return value is >= 0.01m and <= 9999.99m ? null : "Client hourly rate must be between 0.01 and 9,999.99";
    }

    public static string? ValidateVacationDaysPerYear(int? value)
    {
        if (value is null) return "Vacation days per year must be between 1 and 365";
        return value is >= 1 and <= 365 ? null : "Vacation days per year must be between 1 and 365";
    }

    public static string? ValidateCurrency(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !ValidCurrencyCodes.Contains(value))
            return "Invalid currency code";
        return null;
    }

    public static string? ValidateVacationReservePercent(decimal? value, bool isManual)
    {
        if (!isManual) return null;
        if (value is null) return "Reserve percentage must be between 0.01 and 99.99";
        return value is >= 0.01m and <= 99.99m ? null : "Reserve percentage must be between 0.01 and 99.99";
    }

    public static Dictionary<string, string> ValidateAll(UpdateMemberFinancialsRequest request)
    {
        var errors = new Dictionary<string, string>();

        var salaryErr = ValidateMonthlySalary(request.MonthlySalary);
        if (salaryErr != null) errors["monthlySalary"] = salaryErr;

        var rateErr = ValidateClientHourlyRate(request.ClientHourlyRate);
        if (rateErr != null) errors["clientHourlyRate"] = rateErr;

        var daysErr = ValidateVacationDaysPerYear(request.VacationDaysPerYear);
        if (daysErr != null) errors["vacationDaysPerYear"] = daysErr;

        var currencyErr = ValidateCurrency(request.Currency);
        if (currencyErr != null) errors["currency"] = currencyErr;

        var percentErr = ValidateVacationReservePercent(request.VacationReservePercent, request.IsReservePercentManual);
        if (percentErr != null) errors["vacationReservePercent"] = percentErr;

        return errors;
    }
}

public class UpdateMemberFinancialsRequest
{
    public decimal? MonthlySalary { get; set; }
    public decimal? ClientHourlyRate { get; set; }
    public int? VacationDaysPerYear { get; set; }
    public string? Currency { get; set; }
    public bool IsReservePercentManual { get; set; }
    public decimal? VacationReservePercent { get; set; }
}
