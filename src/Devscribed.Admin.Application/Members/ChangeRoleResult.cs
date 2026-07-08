namespace Devscribed.Admin.Application.Members;

public class ChangeRoleResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static ChangeRoleResult Ok() => new() { Success = true };

    public static ChangeRoleResult Failed(string error) => new() { Success = false, Error = error };
}
