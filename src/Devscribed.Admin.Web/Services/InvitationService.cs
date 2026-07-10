using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class InvitationService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenGenerator _tokenGenerator;
    private readonly IEmailSender _emailSender;

    public InvitationService(
        AppDbContext db,
        IPasswordHasher passwordHasher,
        ITokenGenerator tokenGenerator,
        IEmailSender emailSender)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _tokenGenerator = tokenGenerator;
        _emailSender = emailSender;
    }

    public async Task<CreateInvitationResult> CreateInvitationAsync(
        string inviterEmail,
        string inviterRole,
        Guid inviterMembershipId,
        Guid organizationId,
        InviteRequest request,
        string inviteUrlBase)
    {
        if (inviterRole != "admin" && inviterRole != "manager")
            return CreateInvitationResult.ForbiddenResult("You do not have permission to invite members");

        var emailError = InviteValidator.ValidateEmail(request.Email);
        if (emailError != null)
            return CreateInvitationResult.Failure(emailError);

        var roleError = InviteValidator.ValidateRole(request.Role);
        if (roleError != null)
            return CreateInvitationResult.Failure(roleError);

        var normalizedEmail = SignupValidator.NormalizeEmail(request.Email);
        var targetRole = request.Role.Trim();

        var selfInviteError = InviteValidator.ValidateNotSelfInvite(inviterEmail, normalizedEmail);
        if (selfInviteError != null)
            return CreateInvitationResult.Failure(selfInviteError);

        if (targetRole == "admin" && inviterRole != "admin")
            return CreateInvitationResult.ForbiddenResult("You do not have permission to assign the admin role");

        var alreadyMember = await _db.Memberships
            .Include(m => m.Account)
            .AnyAsync(m => m.OrganizationId == organizationId && m.Status == "active" && m.Account.Email == normalizedEmail);
        if (alreadyMember)
            return CreateInvitationResult.Failure("This person is already a member of your organization");

        var now = DateTime.UtcNow;

        var priorPending = await _db.Invitations
            .Where(i => i.Email == normalizedEmail && i.OrganizationId == organizationId && i.Status == "pending")
            .ToListAsync();
        foreach (var prior in priorPending)
            prior.Status = "invalidated";

        var rawToken = _tokenGenerator.GenerateToken();
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            Role = targetRole,
            OrganizationId = organizationId,
            InviterMembershipId = inviterMembershipId,
            TokenHash = _tokenGenerator.Hash(rawToken),
            CreatedAt = now,
            ExpiresAt = now.AddDays(7),
            Status = "pending",
        };
        _db.Invitations.Add(invitation);
        await _db.SaveChangesAsync();

        var inviteLink = $"{inviteUrlBase}/accept-invite?token={rawToken}";
        try
        {
            await _emailSender.SendAsync(
                normalizedEmail,
                "You've been invited",
                $"You've been invited to join an organization. Click the link below to accept:\n{inviteLink}\nThis link expires in 7 days.");
        }
        catch
        {
            // Email dispatch failures must not change the API response.
        }

        return CreateInvitationResult.Success();
    }

    public async Task<ValidateInvitationResult> ValidateTokenAsync(string? rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
            return ValidateInvitationResult.Failure("This invitation is no longer valid");

        var tokenHash = _tokenGenerator.Hash(rawToken);
        var invitation = await _db.Invitations
            .Include(i => i.Organization)
            .SingleOrDefaultAsync(i => i.TokenHash == tokenHash);

        if (invitation == null || invitation.Status != "pending")
            return ValidateInvitationResult.Failure("This invitation is no longer valid");

        var now = DateTime.UtcNow;
        if (now >= invitation.ExpiresAt)
            return ValidateInvitationResult.Failure("This invitation has expired");

        var account = await _db.Accounts
            .Include(a => a.Membership)
            .SingleOrDefaultAsync(a => a.Email == invitation.Email);

        var (orgSwitch, oldOrgName, lastAdmin) = await DetermineOrgSwitchAsync(account, invitation.OrganizationId);

        return ValidateInvitationResult.Success(
            invitation.Organization.Name,
            invitation.Email,
            invitation.Role,
            accountExists: account != null,
            orgSwitch,
            oldOrgName,
            lastAdmin);
    }

    public async Task<AcceptInvitationResult> AcceptAsync(AcceptInviteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
            return AcceptInvitationResult.Failure("This invitation is no longer valid");

        var tokenHash = _tokenGenerator.Hash(request.Token);
        var invitation = await _db.Invitations
            .Include(i => i.Organization)
            .SingleOrDefaultAsync(i => i.TokenHash == tokenHash);

        if (invitation == null || invitation.Status != "pending")
            return AcceptInvitationResult.Failure("This invitation is no longer valid");

        var now = DateTime.UtcNow;
        if (now >= invitation.ExpiresAt)
            return AcceptInvitationResult.Failure("This invitation has expired");

        var account = await _db.Accounts
            .Include(a => a.Membership)
            .SingleOrDefaultAsync(a => a.Email == invitation.Email);

        if (account == null)
            return await AcceptNewAccountAsync(invitation, request, now);

        return await AcceptExistingAccountAsync(invitation, account, request, now);
    }

    private async Task<AcceptInvitationResult> AcceptNewAccountAsync(Invitation invitation, AcceptInviteRequest request, DateTime now)
    {
        var errors = new Dictionary<string, string>();

        var firstNameError = SignupValidator.ValidateFirstName(request.FirstName);
        if (firstNameError != null) errors["firstName"] = firstNameError;

        var lastNameError = SignupValidator.ValidateLastName(request.LastName);
        if (lastNameError != null) errors["lastName"] = lastNameError;

        var passwordError = SignupValidator.ValidatePassword(request.Password);
        if (passwordError != null) errors["password"] = passwordError;

        if (errors.Count > 0)
            return AcceptInvitationResult.ValidationFailure(errors);

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = invitation.Email,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FirstName = request.FirstName!.Trim(),
            LastName = request.LastName!.Trim(),
            Timezone = request.Timezone,
            CreatedAt = now,
        };

        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = invitation.OrganizationId,
            Role = invitation.Role,
            Status = "active",
            JoinedAt = now,
        };

        invitation.Status = "used";
        invitation.UsedAt = now;

        _db.Accounts.Add(account);
        _db.Memberships.Add(membership);
        await _db.SaveChangesAsync();

        return AcceptInvitationResult.Success(account.Id, membership.Id, invitation.OrganizationId, invitation.Role, account.SecurityStamp, account.Email);
    }

    private async Task<AcceptInvitationResult> AcceptExistingAccountAsync(
        Invitation invitation, Account account, AcceptInviteRequest request, DateTime now)
    {
        if (!_passwordHasher.Verify(request.Password, account.PasswordHash))
            return AcceptInvitationResult.Failure("Incorrect password");

        var existingMembership = account.Membership;
        Guid resultMembershipId;

        if (existingMembership != null && existingMembership.OrganizationId != invitation.OrganizationId)
        {
            var (_, oldOrgName, lastAdmin) = await DetermineOrgSwitchAsync(account, invitation.OrganizationId);

            if (!request.OrgSwitchConfirmed)
                return AcceptInvitationResult.OrgSwitchRequired(oldOrgName!, lastAdmin);

            _db.Memberships.Remove(existingMembership);

            var newMembership = new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                OrganizationId = invitation.OrganizationId,
                Role = invitation.Role,
                Status = "active",
                JoinedAt = now,
            };
            _db.Memberships.Add(newMembership);
            resultMembershipId = newMembership.Id;
        }
        else if (existingMembership != null && existingMembership.OrganizationId == invitation.OrganizationId)
        {
            existingMembership.Role = invitation.Role;
            existingMembership.Status = "active";
            existingMembership.JoinedAt = now;
            existingMembership.JobTitle = null;
            resultMembershipId = existingMembership.Id;
        }
        else
        {
            var newMembership = new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                OrganizationId = invitation.OrganizationId,
                Role = invitation.Role,
                Status = "active",
                JoinedAt = now,
            };
            _db.Memberships.Add(newMembership);
            resultMembershipId = newMembership.Id;
        }

        invitation.Status = "used";
        invitation.UsedAt = now;

        await _db.SaveChangesAsync();

        return AcceptInvitationResult.Success(account.Id, resultMembershipId, invitation.OrganizationId, invitation.Role, account.SecurityStamp, account.Email);
    }

    private async Task<(bool OrgSwitch, string? OldOrgName, bool LastAdmin)> DetermineOrgSwitchAsync(Account? account, Guid invitedOrgId)
    {
        if (account?.Membership == null || account.Membership.OrganizationId == invitedOrgId)
            return (false, null, false);

        var oldMembership = account.Membership;
        var oldOrg = await _db.Organizations.SingleAsync(o => o.Id == oldMembership.OrganizationId);

        var lastAdmin = false;
        if (oldMembership.Role == "admin" && oldMembership.Status == "active")
        {
            var activeAdminCount = await _db.Memberships
                .CountAsync(m => m.OrganizationId == oldMembership.OrganizationId && m.Role == "admin" && m.Status == "active");
            lastAdmin = activeAdminCount == 1;
        }

        return (true, oldOrg.Name, lastAdmin);
    }
}

public class CreateInvitationResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }
    public bool Forbidden { get; init; }

    public static CreateInvitationResult Success() => new() { Succeeded = true };
    public static CreateInvitationResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
    public static CreateInvitationResult ForbiddenResult(string message) => new() { Succeeded = false, ErrorMessage = message, Forbidden = true };
}

public class ValidateInvitationResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }
    public string? OrganizationName { get; init; }
    public string? Email { get; init; }
    public string? Role { get; init; }
    public bool AccountExists { get; init; }
    public bool OrgSwitch { get; init; }
    public string? OldOrganizationName { get; init; }
    public bool LastAdmin { get; init; }

    public static ValidateInvitationResult Success(
        string organizationName, string email, string role, bool accountExists, bool orgSwitch, string? oldOrganizationName, bool lastAdmin) => new()
    {
        Succeeded = true,
        OrganizationName = organizationName,
        Email = email,
        Role = role,
        AccountExists = accountExists,
        OrgSwitch = orgSwitch,
        OldOrganizationName = oldOrganizationName,
        LastAdmin = lastAdmin,
    };

    public static ValidateInvitationResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}

public class AcceptInvitationResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }
    public Dictionary<string, string>? FieldErrors { get; init; }
    public bool OrgSwitchConfirmationRequired { get; init; }
    public string? OldOrganizationName { get; init; }
    public bool LastAdmin { get; init; }
    public Guid AccountId { get; init; }
    public Guid MembershipId { get; init; }
    public Guid OrganizationId { get; init; }
    public string Role { get; init; } = string.Empty;
    public Guid SecurityStamp { get; init; }
    public string Email { get; init; } = string.Empty;

    public static AcceptInvitationResult Success(Guid accountId, Guid membershipId, Guid organizationId, string role, Guid securityStamp, string email) => new()
    {
        Succeeded = true,
        AccountId = accountId,
        MembershipId = membershipId,
        OrganizationId = organizationId,
        Role = role,
        SecurityStamp = securityStamp,
        Email = email,
    };

    public static AcceptInvitationResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };

    public static AcceptInvitationResult ValidationFailure(Dictionary<string, string> errors) => new()
    {
        Succeeded = false,
        FieldErrors = errors,
    };

    public static AcceptInvitationResult OrgSwitchRequired(string oldOrganizationName, bool lastAdmin) => new()
    {
        Succeeded = false,
        OrgSwitchConfirmationRequired = true,
        OldOrganizationName = oldOrganizationName,
        LastAdmin = lastAdmin,
    };
}
