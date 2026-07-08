using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Signup;

public class SignupService(AdminDbContext db, IPasswordHasher passwordHasher)
{
    public async Task<SignupResult> SignUpAsync(SignupRequest request, CancellationToken ct = default)
    {
        var errors = new Dictionary<string, string>();

        var (orgNameValid, normalizedOrgName, orgNameError) = OrganizationNameValidator.Validate(request.OrganizationName);
        if (!orgNameValid)
        {
            errors["orgName"] = orgNameError!;
        }

        if (string.IsNullOrWhiteSpace(request.FirstName))
        {
            errors["firstName"] = "first name is required";
        }

        if (string.IsNullOrWhiteSpace(request.LastName))
        {
            errors["lastName"] = "last name is required";
        }

        var normalizedEmail = (request.Email ?? string.Empty).Trim();
        if (!EmailValidator.IsSyntacticallyValid(normalizedEmail))
        {
            errors["email"] = "must be a valid email address";
        }

        var (passwordValid, passwordError) = PasswordPolicy.Validate(request.Password);
        if (!passwordValid)
        {
            errors["password"] = passwordError!;
        }

        // Only hit the database for the uniqueness check once syntactic validation has passed.
        if (!errors.ContainsKey("email"))
        {
            var emailTaken = await db.Accounts.AnyAsync(a => a.Email == normalizedEmail, ct);
            if (emailTaken)
            {
                errors["email"] = "an account with this email already exists";
            }
        }

        if (errors.Count > 0)
        {
            return SignupResult.Failed(errors);
        }

        var account = new Account
        {
            Email = normalizedEmail,
            PasswordHash = passwordHasher.Hash(request.Password),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim()
        };

        var organization = new Organization
        {
            Name = normalizedOrgName
        };

        var membership = Membership.CreateAdmin(account.Id, organization.Id);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            db.Accounts.Add(account);
            db.Organizations.Add(organization);
            db.Memberships.Add(membership);

            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(ct);
            // Race: another signup took this email between our check and the insert.
            return SignupResult.Failed(new Dictionary<string, string>
            {
                ["email"] = "an account with this email already exists"
            });
        }

        return SignupResult.Ok(account, organization, membership);
    }
}
