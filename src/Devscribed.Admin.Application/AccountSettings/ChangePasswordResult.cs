namespace Devscribed.Admin.Application.AccountSettings;

public class ChangePasswordResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static ChangePasswordResult Ok() => new() { Success = true };

    public static ChangePasswordResult Failed(string error) => new() { Success = false, Error = error };
}
