using System.Net.Mail;

namespace Devscribed.Admin.Application.Validation;

public static class EmailValidator
{
    public static bool IsSyntacticallyValid(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        try
        {
            var address = new MailAddress(input);
            return address.Address == input;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
