namespace Devscribed.Admin.Application.Auth;

public class ResetPasswordResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static ResetPasswordResult Ok() => new() { Success = true };

    public static ResetPasswordResult Failed(string error) => new()
    {
        Success = false,
        Error = error
    };
}
