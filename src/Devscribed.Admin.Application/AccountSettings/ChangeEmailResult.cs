namespace Devscribed.Admin.Application.AccountSettings;

public class ChangeEmailResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static ChangeEmailResult Ok() => new() { Success = true };

    public static ChangeEmailResult Failed(string error) => new() { Success = false, Error = error };
}
