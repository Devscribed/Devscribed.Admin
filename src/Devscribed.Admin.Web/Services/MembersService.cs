using System.Collections.Concurrent;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class MembersService
{
    // Serializes delete operations per organization so the zero-admin guard is enforced
    // atomically even when two admins race to delete each other concurrently.
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> OrgLocks = new();

    private readonly AppDbContext _db;

    public MembersService(AppDbContext db)
    {
        _db = db;
    }

    private static SemaphoreSlim GetLock(Guid organizationId) =>
        OrgLocks.GetOrAdd(organizationId, _ => new SemaphoreSlim(1, 1));

    private Task<int> GetActiveAdminCountAsync(Guid organizationId) =>
        _db.Memberships.CountAsync(m => m.OrganizationId == organizationId && m.Role == "admin" && m.Status == "active");

    public async Task<MembersListResult> GetMembersAsync(
        Guid organizationId, Guid callerMembershipId, string callerRole, string? search, bool showRemoved)
    {
        var query = _db.Memberships
            .Include(m => m.Account)
            .Where(m => m.OrganizationId == organizationId);

        query = showRemoved
            ? query.Where(m => m.Status == "active" || m.Status == "removed")
            : query.Where(m => m.Status == "active");

        var members = await query.ToListAsync();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            members = members
                .Where(m =>
                    $"{m.Account.FirstName} {m.Account.LastName}".ToLowerInvariant().Contains(term) ||
                    m.Account.Email.ToLowerInvariant().Contains(term))
                .ToList();
        }

        members = members
            .OrderBy(m => m.Account.FirstName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(m => m.Account.LastName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var activeAdminCount = await GetActiveAdminCountAsync(organizationId);

        var dtos = members.Select(m => new MemberDto
        {
            Id = m.Id,
            FullName = $"{m.Account.FirstName} {m.Account.LastName}",
            Email = m.Account.Email,
            Role = m.Role,
            Status = m.Status,
            JoinedAt = m.JoinedAt,
            IsLastAdmin = m.Role == "admin" && m.Status == "active" && activeAdminCount == 1,
            IsSelf = m.Id == callerMembershipId,
        }).ToList();

        return new MembersListResult { Members = dtos, CallerRole = callerRole };
    }

    public async Task<MemberDetailFetchResult> GetDetailAsync(
        Guid organizationId, Guid memberId, string callerRole)
    {
        var target = await _db.Memberships
            .Include(m => m.Account)
            .SingleOrDefaultAsync(m => m.Id == memberId && m.OrganizationId == organizationId);

        if (target == null)
            return MemberDetailFetchResult.NotFound();

        var activeAdminCount = await GetActiveAdminCountAsync(organizationId);
        var isLastAdmin = target.Role == "admin" && target.Status == "active" && activeAdminCount == 1;

        var dto = new MemberDetailDto
        {
            Id = target.Id,
            FullName = $"{target.Account.FirstName} {target.Account.LastName}",
            Email = target.Account.Email,
            Role = target.Role,
            Status = target.Status,
            JoinedAt = target.JoinedAt,
            JobTitle = target.JobTitle,
            Timezone = target.Account.Timezone ?? "UTC",
            AvatarInitials = AvatarInitials.Generate(target.Account.FirstName, target.Account.LastName),
            IsLastAdmin = isLastAdmin,
            CanEditRole = MemberPermissions.CanEditRole(callerRole, target.Role, target.Status),
            CanEditJobTitle = MemberPermissions.CanEditJobTitle(callerRole, target.Status),
            AvailableRoles = MemberPermissions.GetAvailableRoles(callerRole, target.Role, target.Status),
            CallerRole = callerRole,
        };

        return MemberDetailFetchResult.Ok(dto);
    }

    public async Task<MemberActionResult> DeleteAsync(
        Guid organizationId, Guid targetMembershipId, Guid callerMembershipId, string callerRole)
    {
        if (!MemberPermissions.CanDeleteOrRestore(callerRole))
            return MemberActionResult.Forbidden("You do not have permission to remove members");

        var orgLock = GetLock(organizationId);
        await orgLock.WaitAsync();
        try
        {
            var target = await _db.Memberships
                .Include(m => m.Account)
                .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);

            if (target == null)
                return MemberActionResult.NotFound();

            if (target.Id == callerMembershipId)
                return MemberActionResult.Conflict("cannot_remove_self", "You cannot remove yourself from the organization");

            if (target.Status == "removed")
                return MemberActionResult.Conflict("already_removed", "Member is already removed");

            if (target.Role == "admin")
            {
                var activeAdminCount = await GetActiveAdminCountAsync(organizationId);
                if (activeAdminCount <= 1)
                    return MemberActionResult.Conflict("last_admin_guard", "Organization must retain at least one admin");
            }

            target.Status = "removed";
            target.Account.SecurityStamp = Guid.NewGuid();
            await _db.SaveChangesAsync();

            return MemberActionResult.Ok();
        }
        finally
        {
            orgLock.Release();
        }
    }

    public async Task<MemberActionResult> UpdateDetailAsync(
        Guid organizationId, Guid targetMembershipId, string callerRole, string? role, string? jobTitle)
    {
        if (callerRole is not ("admin" or "manager"))
            return MemberActionResult.Forbidden("You do not have permission to edit members");

        if (role == null || !MemberPermissions.AllRoles.Contains(role))
            return MemberActionResult.BadRequest("invalid_role", "Invalid role");

        var jobTitleError = JobTitleValidator.Validate(jobTitle);
        if (jobTitleError != null)
            return MemberActionResult.FieldValidationError(new Dictionary<string, string> { ["jobTitle"] = jobTitleError });

        var orgLock = GetLock(organizationId);
        await orgLock.WaitAsync();
        try
        {
            var target = await _db.Memberships
                .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);

            if (target == null)
                return MemberActionResult.NotFound();

            if (target.Status == "removed")
                return MemberActionResult.BadRequest("member_removed", "Cannot edit a removed member");

            var roleChanging = role != target.Role;
            if (roleChanging)
            {
                var canAssign = MemberPermissions.CanEditRole(callerRole, target.Role, target.Status)
                              && MemberPermissions.CanAssignRole(callerRole, role);
                if (!canAssign)
                    return MemberActionResult.Forbidden("You do not have permission to assign this role", "role_authority");

                if (target.Role == "admin")
                {
                    var activeAdminCount = await GetActiveAdminCountAsync(organizationId);
                    if (activeAdminCount <= 1)
                        return MemberActionResult.Conflict("last_admin_guard", "Organization must retain at least one admin");
                }
            }

            target.Role = role;
            target.JobTitle = string.IsNullOrEmpty(jobTitle) ? null : jobTitle;
            await _db.SaveChangesAsync();

            return MemberActionResult.Ok();
        }
        finally
        {
            orgLock.Release();
        }
    }

    public async Task<MemberActionResult> RestoreAsync(
        Guid organizationId, Guid targetMembershipId, string callerRole)
    {
        if (!MemberPermissions.CanDeleteOrRestore(callerRole))
            return MemberActionResult.Forbidden("You do not have permission to restore members");

        var target = await _db.Memberships
            .SingleOrDefaultAsync(m => m.Id == targetMembershipId && m.OrganizationId == organizationId);

        if (target == null)
            return MemberActionResult.NotFound();

        if (target.Status != "removed")
            return MemberActionResult.Conflict("not_removed", "Member is not in removed status");

        target.Status = "active";
        target.JoinedAt = DateTime.UtcNow;
        target.JobTitle = null;
        await _db.SaveChangesAsync();

        return MemberActionResult.Ok();
    }
}

public class MemberDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public bool IsLastAdmin { get; set; }
    public bool IsSelf { get; set; }
}

public class MembersListResult
{
    public List<MemberDto> Members { get; set; } = new();
    public string CallerRole { get; set; } = string.Empty;
}

public class MemberDetailDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public string? JobTitle { get; set; }
    public string Timezone { get; set; } = string.Empty;
    public string AvatarInitials { get; set; } = string.Empty;
    public bool IsLastAdmin { get; set; }
    public bool CanEditRole { get; set; }
    public bool CanEditJobTitle { get; set; }
    public string[] AvailableRoles { get; set; } = Array.Empty<string>();
    public string CallerRole { get; set; } = string.Empty;
}

public enum MemberDetailOutcome
{
    Success,
    NotFound,
}

public class MemberDetailFetchResult
{
    public MemberDetailOutcome Outcome { get; init; }
    public MemberDetailDto? Dto { get; init; }

    public static MemberDetailFetchResult Ok(MemberDetailDto dto) => new()
    { Outcome = MemberDetailOutcome.Success, Dto = dto };
    public static MemberDetailFetchResult NotFound() => new() { Outcome = MemberDetailOutcome.NotFound };
}

public enum MemberActionOutcome
{
    Success,
    NotFound,
    Forbidden,
    Conflict,
    BadRequest,
    FieldValidation,
}

public class MemberActionResult
{
    public MemberActionOutcome Outcome { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }
    public Dictionary<string, string>? FieldErrors { get; init; }

    public static MemberActionResult Ok() => new() { Outcome = MemberActionOutcome.Success };
    public static MemberActionResult NotFound() => new() { Outcome = MemberActionOutcome.NotFound };
    public static MemberActionResult Forbidden(string message, string code = "forbidden") => new()
    { Outcome = MemberActionOutcome.Forbidden, ErrorCode = code, ErrorMessage = message };
    public static MemberActionResult Conflict(string code, string message) => new()
    { Outcome = MemberActionOutcome.Conflict, ErrorCode = code, ErrorMessage = message };
    public static MemberActionResult BadRequest(string code, string message) => new()
    { Outcome = MemberActionOutcome.BadRequest, ErrorCode = code, ErrorMessage = message };
    public static MemberActionResult FieldValidationError(Dictionary<string, string> errors) => new()
    { Outcome = MemberActionOutcome.FieldValidation, FieldErrors = errors };
}
