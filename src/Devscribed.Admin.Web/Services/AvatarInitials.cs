namespace Devscribed.Admin.Web.Services;

public static class AvatarInitials
{
    public static string Generate(string firstName, string lastName)
    {
        return FirstUpper(firstName) + FirstUpper(lastName);
    }

    private static string FirstUpper(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var trimmed = value.Trim();
        return char.ToUpperInvariant(trimmed[0]).ToString();
    }
}
