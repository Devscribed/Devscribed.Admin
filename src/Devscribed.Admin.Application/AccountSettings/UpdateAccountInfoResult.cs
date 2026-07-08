namespace Devscribed.Admin.Application.AccountSettings;

public class UpdateAccountInfoResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }
    public string? Field { get; private init; }

    public static UpdateAccountInfoResult Ok() => new() { Success = true };

    public static UpdateAccountInfoResult Failed(string error, string? field = null) =>
        new() { Success = false, Error = error, Field = field };
}
