using System.Collections.Concurrent;
using Devscribed.Admin.Web.Data;
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

        var activeAdminCount = await _db.Memberships
            .CountAsync(m => m.OrganizationId == organizationId && m.Role == "admin" && m.Status == "active");

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
                var activeAdminCount = await _db.Memberships
                    .CountAsync(m => m.OrganizationId == organizationId && m.Role == "admin" && m.Status == "active");
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

public enum MemberActionOutcome
{
    Success,
    NotFound,
    Forbidden,
    Conflict,
}

public class MemberActionResult
{
    public MemberActionOutcome Outcome { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }

    public static MemberActionResult Ok() => new() { Outcome = MemberActionOutcome.Success };
    public static MemberActionResult NotFound() => new() { Outcome = MemberActionOutcome.NotFound };
    public static MemberActionResult Forbidden(string message) => new()
    { Outcome = MemberActionOutcome.Forbidden, ErrorMessage = message };
    public static MemberActionResult Conflict(string code, string message) => new()
    { Outcome = MemberActionOutcome.Conflict, ErrorCode = code, ErrorMessage = message };
}
