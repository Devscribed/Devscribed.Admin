namespace Devscribed.Admin.Domain.Services;

public static class AvatarInitials
{
    public static string Generate(string firstName, string lastName)
    {
        var first = firstName.Length > 0 ? char.ToUpperInvariant(firstName[0]) : '?';
        var last = lastName.Length > 0 ? char.ToUpperInvariant(lastName[0]) : '?';
        return $"{first}{last}";
    }
}
