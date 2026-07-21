using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Invitations;

public static class InvitationEndpoints
{
    private const int TokenExpiryDays = 7;

    public static IEndpointRouteBuilder MapInvitationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/invitations", HandleCreateAsync).RequireAuthorization();
        app.MapGet("/api/invitations/{token}/validate", HandleValidateAsync);
        app.MapPost("/api/invitations/accept", HandleAcceptAsync);
        return app;
    }

    private static async Task<IResult> HandleCreateAsync(
        CreateInvitationRequest request, AppDbContext db, IEmailService emailService, HttpContext http)
    {
        // Get caller's info from claims
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var orgIdClaim = http.User.FindFirstValue("OrganizationId");

        if (accountIdClaim is null || orgIdClaim is null ||
            !Guid.TryParse(accountIdClaim, out var accountId) ||
            !Guid.TryParse(orgIdClaim, out var organizationId))
            return Results.Unauthorized();

        // Get caller's membership
        var callerMembership = await db.Memberships
            .Include(m => m.Account)
            .FirstOrDefaultAsync(m =>
                m.AccountId == accountId &&
                m.OrganizationId == organizationId &&
                m.Status == MembershipStatus.Active);

        if (callerMembership is null)
            return Results.Unauthorized();

        // Check permission: only admin/manager can invite
        if (callerMembership.Role != MemberRole.Admin && callerMembership.Role != MemberRole.Manager)
            return Results.Json(new { message = "You do not have permission to invite members" }, statusCode: 403);

        // Validate payload
        var validation = InvitationValidator.ValidateInvitePayload(
            request.Email, request.Role, callerMembership.Account.Email);

        if (!validation.IsValid)
        {
            // Check if it's the self-invite or other bad-request error
            return Results.BadRequest(new { message = validation.ErrorMessage });
        }

        var normalizedEmail = validation.NormalizedEmail!;
        var parsedRole = validation.ParsedRole!.Value;

        // Manager cannot assign admin role
        if (callerMembership.Role == MemberRole.Manager && parsedRole == MemberRole.Admin)
            return Results.Json(new { message = "You do not have permission to assign the admin role" }, statusCode: 403);

        // Check if email is already an active member of this org
        var isActiveMember = await db.Memberships
            .AnyAsync(m =>
                m.Account.Email == normalizedEmail &&
                m.OrganizationId == organizationId &&
                m.Status == MembershipStatus.Active);

        if (isActiveMember)
            return Results.BadRequest(new { message = "This person is already a member of your organization" });

        // Supersede any existing pending invitations for same (email, org)
        var existingPending = await db.Invitations
            .Where(i =>
                i.Email == normalizedEmail &&
                i.OrganizationId == organizationId &&
                i.Status == InvitationStatus.Pending)
            .ToListAsync();

        foreach (var existing in existingPending)
            existing.Status = InvitationStatus.Invalidated;

        // Generate token
        var rawTokenBytes = RandomNumberGenerator.GetBytes(32);
        var rawToken = Convert.ToBase64String(rawTokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var now = DateTime.UtcNow;
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Role = parsedRole,
            OrganizationId = organizationId,
            InviterMembershipId = callerMembership.Id,
            TokenHash = tokenHash,
            CreatedAt = now,
            ExpiresAt = now.AddDays(TokenExpiryDays),
            Status = InvitationStatus.Pending,
        };

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        // Get org name for email
        var org = await db.Organizations.FindAsync(organizationId);
        var acceptUrl = $"/accept-invite?token={rawToken}";
        await emailService.SendInvitationEmailAsync(normalizedEmail, org!.Name, rawToken, acceptUrl);

        return Results.Ok(new { message = "Invitation sent" });
    }

    private static async Task<IResult> HandleValidateAsync(string token, AppDbContext db)
    {
        var rawToken = token.Trim();
        if (string.IsNullOrWhiteSpace(rawToken))
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var invitation = await db.Invitations
            .Include(i => i.Organization)
            .Include(i => i.InviterMembership)
            .FirstOrDefaultAsync(i => i.TokenHash == tokenHash);

        if (invitation is null)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check if used or invalidated
        if (invitation.Status == InvitationStatus.Used || invitation.Status == InvitationStatus.Invalidated)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check if inviter's membership is no longer active
        if (invitation.InviterMembership.Status != MembershipStatus.Active)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check expiry
        var now = DateTime.UtcNow;
        if (now >= invitation.ExpiresAt)
            return Results.BadRequest(new { message = "This invitation has expired" });

        // Check if account exists
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Email == invitation.Email);
        var accountExists = account is not null;

        // Check org-switch
        var orgSwitch = false;
        string? oldOrganizationName = null;
        var lastAdmin = false;

        if (accountExists)
        {
            var existingMembership = await db.Memberships
                .Include(m => m.Organization)
                .FirstOrDefaultAsync(m => m.AccountId == account!.Id);

            if (existingMembership is not null && existingMembership.OrganizationId != invitation.OrganizationId)
            {
                orgSwitch = true;
                oldOrganizationName = existingMembership.Organization.Name;

                // Check if last admin
                if (existingMembership.Role == MemberRole.Admin && existingMembership.Status == MembershipStatus.Active)
                {
                    var adminCount = await db.Memberships
                        .CountAsync(m =>
                            m.OrganizationId == existingMembership.OrganizationId &&
                            m.Role == MemberRole.Admin &&
                            m.Status == MembershipStatus.Active);
                    lastAdmin = adminCount == 1;
                }
            }
        }

        return Results.Ok(new
        {
            organizationName = invitation.Organization.Name,
            email = invitation.Email,
            role = invitation.Role.ToString().ToLower(),
            accountExists,
            orgSwitch,
            oldOrganizationName,
            lastAdmin
        });
    }

    private static async Task<IResult> HandleAcceptAsync(
        AcceptInvitationRequest request, AppDbContext db, HttpContext http)
    {
        var rawToken = (request.Token ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(rawToken))
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var invitation = await db.Invitations
            .Include(i => i.Organization)
            .Include(i => i.InviterMembership)
            .FirstOrDefaultAsync(i => i.TokenHash == tokenHash);

        if (invitation is null)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check if used or invalidated
        if (invitation.Status == InvitationStatus.Used || invitation.Status == InvitationStatus.Invalidated)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check if inviter's membership is no longer active
        if (invitation.InviterMembership.Status != MembershipStatus.Active)
            return Results.BadRequest(new { message = "This invitation is no longer valid" });

        // Check expiry
        var now = DateTime.UtcNow;
        if (now >= invitation.ExpiresAt)
            return Results.BadRequest(new { message = "This invitation has expired" });

        // Determine if account exists
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Email == invitation.Email);

        if (account is null)
        {
            // New account flow
            var errors = InvitationValidator.ValidateAcceptNewAccountPayload(
                request.FirstName, request.LastName, request.Password);

            if (errors.Count > 0)
                return Results.BadRequest(new { errors });

            var firstNameResult = PersonNameValidator.Validate(request.FirstName, "First name");
            var lastNameResult = PersonNameValidator.Validate(request.LastName, "Last name");
            var passwordResult = PasswordValidator.Validate(request.Password);

            account = new Account
            {
                Id = Guid.NewGuid(),
                Email = invitation.Email,
                PasswordHash = PasswordHasher.Hash(passwordResult.NormalizedValue!),
                FirstName = firstNameResult.NormalizedValue!,
                LastName = lastNameResult.NormalizedValue!,
                Timezone = string.IsNullOrWhiteSpace(request.Timezone) ? null : request.Timezone,
                CreatedAt = now,
            };
            db.Accounts.Add(account);

            var membership = new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                OrganizationId = invitation.OrganizationId,
                Role = invitation.Role,
                Status = MembershipStatus.Active,
                JoinedAt = now,
            };
            db.Memberships.Add(membership);
        }
        else
        {
            // Existing account flow
            var password = request.Password ?? string.Empty;
            if (!PasswordHasher.Verify(password, account.PasswordHash))
                return Results.BadRequest(new { message = "Incorrect password" });

            // Check for existing membership
            var existingMembership = await db.Memberships
                .Include(m => m.Organization)
                .FirstOrDefaultAsync(m => m.AccountId == account.Id);

            if (existingMembership is not null)
            {
                if (existingMembership.OrganizationId == invitation.OrganizationId)
                {
                    // Same org - restore if removed
                    if (existingMembership.Status == MembershipStatus.Removed)
                    {
                        existingMembership.Status = MembershipStatus.Active;
                        existingMembership.Role = invitation.Role;
                        existingMembership.JobTitle = null;
                        existingMembership.JoinedAt = now;
                    }
                }
                else
                {
                    // Org-switch
                    if (!request.OrgSwitchConfirmed)
                    {
                        // Check if last admin
                        var isLastAdmin = false;
                        if (existingMembership.Role == MemberRole.Admin &&
                            existingMembership.Status == MembershipStatus.Active)
                        {
                            var adminCount = await db.Memberships
                                .CountAsync(m =>
                                    m.OrganizationId == existingMembership.OrganizationId &&
                                    m.Role == MemberRole.Admin &&
                                    m.Status == MembershipStatus.Active);
                            isLastAdmin = adminCount == 1;
                        }

                        return Results.Json(new
                        {
                            message = "org_switch_confirmation_required",
                            oldOrganizationName = existingMembership.Organization.Name,
                            lastAdmin = isLastAdmin
                        }, statusCode: 409);
                    }

                    // Hard-delete old membership
                    db.Memberships.Remove(existingMembership);

                    // Create new membership in new org
                    var newMembership = new Membership
                    {
                        Id = Guid.NewGuid(),
                        AccountId = account.Id,
                        OrganizationId = invitation.OrganizationId,
                        Role = invitation.Role,
                        Status = MembershipStatus.Active,
                        JoinedAt = now,
                    };
                    db.Memberships.Add(newMembership);
                }
            }
            else
            {
                // No existing membership at all - create one
                var newMembership = new Membership
                {
                    Id = Guid.NewGuid(),
                    AccountId = account.Id,
                    OrganizationId = invitation.OrganizationId,
                    Role = invitation.Role,
                    Status = MembershipStatus.Active,
                    JoinedAt = now,
                };
                db.Memberships.Add(newMembership);
            }
        }

        // Mark invitation as used
        invitation.Status = InvitationStatus.Used;
        invitation.UsedAt = now;

        await db.SaveChangesAsync();

        // Sign in
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new("SecurityStamp", account.SecurityStamp),
            new("OrganizationId", invitation.OrganizationId.ToString()),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

        return Results.Ok(new { accountId = account.Id, redirectTo = "/members" });
    }
}
