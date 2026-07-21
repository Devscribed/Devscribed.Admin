using System.Security.Claims;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Factories;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Signup;

public static class SignupEndpoint
{
    public const string DuplicateEmailMessage = "This email is already registered";

    public static IEndpointRouteBuilder MapSignupEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/signup", HandleAsync);
        return app;
    }

    private static async Task<IResult> HandleAsync(SignupRequest request, AppDbContext db, HttpContext http)
    {
        var orgNameResult = OrganizationNameValidator.Validate(request.OrgName);
        if (!orgNameResult.IsValid)
            return Results.BadRequest(new { message = orgNameResult.ErrorMessage });

        var firstNameResult = PersonNameValidator.Validate(request.FirstName, "First name");
        if (!firstNameResult.IsValid)
            return Results.BadRequest(new { message = firstNameResult.ErrorMessage });

        var lastNameResult = PersonNameValidator.Validate(request.LastName, "Last name");
        if (!lastNameResult.IsValid)
            return Results.BadRequest(new { message = lastNameResult.ErrorMessage });

        var emailResult = EmailValidator.Validate(request.Email);
        if (!emailResult.IsValid)
            return Results.BadRequest(new { message = emailResult.ErrorMessage });

        var passwordResult = PasswordValidator.Validate(request.Password);
        if (!passwordResult.IsValid)
            return Results.BadRequest(new { message = passwordResult.ErrorMessage });

        var normalizedEmail = emailResult.NormalizedValue!;

        var emailTaken = await db.Accounts.AnyAsync(a => a.Email == normalizedEmail);
        if (emailTaken)
            return Results.BadRequest(new { message = DuplicateEmailMessage });

        var now = DateTime.UtcNow;

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            PasswordHash = PasswordHasher.Hash(passwordResult.NormalizedValue!),
            FirstName = firstNameResult.NormalizedValue!,
            LastName = lastNameResult.NormalizedValue!,
            Timezone = string.IsNullOrWhiteSpace(request.Timezone) ? null : request.Timezone,
            CreatedAt = now,
        };

        var organization = new Organization
        {
            Id = Guid.NewGuid(),
            Name = orgNameResult.NormalizedValue!,
            CreatedAt = now,
        };

        var membership = OrganizationCreationFactory.CreateAdminMembership(account.Id, organization.Id, now);

        db.Accounts.Add(account);
        db.Organizations.Add(organization);
        db.Memberships.Add(membership);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Race condition: another signup may have claimed this email between our
            // check and insert. Detach the failed entities so a fresh query can run.
            db.ChangeTracker.Clear();
            var stillTaken = await db.Accounts.AnyAsync(a => a.Email == normalizedEmail);
            if (stillTaken)
                return Results.BadRequest(new { message = DuplicateEmailMessage });

            throw;
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new("SecurityStamp", account.SecurityStamp),
            new("OrganizationId", organization.Id.ToString()),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

        return Results.Ok(new { accountId = account.Id, organizationId = organization.Id });
    }
}
