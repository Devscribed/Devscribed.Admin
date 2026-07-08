namespace Devscribed.Admin.Application.Members;

public class UpdateJobTitleResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static UpdateJobTitleResult Ok() => new() { Success = true };

    public static UpdateJobTitleResult Failed(string error) => new() { Success = false, Error = error };
}
