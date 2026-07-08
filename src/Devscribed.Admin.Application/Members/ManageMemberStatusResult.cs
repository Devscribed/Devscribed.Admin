namespace Devscribed.Admin.Application.Members;

public class ManageMemberStatusResult
{
    private ManageMemberStatusResult(bool success, string? error)
    {
        Success = success;
        Error = error;
    }

    public bool Success { get; }
    public string? Error { get; }

    public static ManageMemberStatusResult Ok() => new(true, null);
    public static ManageMemberStatusResult Failed(string error) => new(false, error);
}
