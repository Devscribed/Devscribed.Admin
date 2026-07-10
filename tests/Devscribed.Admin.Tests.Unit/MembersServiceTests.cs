using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests.Unit;

public class MembersServiceTests
{
    private static AppDbContext NewDb() => new(
        new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<Membership> SeedAsync(
        AppDbContext db, Guid orgId, string firstName, string lastName, string email,
        string role = "user", string status = "active")
    {
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = "hash",
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = orgId,
            Role = role,
            Status = status,
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();
        return membership;
    }

    // TC-04-UNIT-01: Search matching (name/email, partial, case-insensitive)
    [Fact]
    public async Task Search_matches_name_or_email_case_insensitively()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var alex = await SeedAsync(db, orgId, "Alex", "Kaminski", "alex.k@acme.com");
        var alesia = await SeedAsync(db, orgId, "Alesia", "Varaniuk", "alesia@acme.com");
        var pat = await SeedAsync(db, orgId, "Pat", "Owner", "pat@acme.com");
        var service = new MembersService(db);

        var r1 = await service.GetMembersAsync(orgId, pat.Id, "admin", "ale", showRemoved: false);
        var r2 = await service.GetMembersAsync(orgId, pat.Id, "admin", "ALEX", showRemoved: false);
        var r3 = await service.GetMembersAsync(orgId, pat.Id, "admin", "pat@", showRemoved: false);
        var r4 = await service.GetMembersAsync(orgId, pat.Id, "admin", "zzz", showRemoved: false);

        Assert.Equal(new[] { "Alesia Varaniuk", "Alex Kaminski" }, r1.Members.Select(m => m.FullName).OrderBy(n => n));
        Assert.Equal("Alex Kaminski", Assert.Single(r2.Members).FullName);
        Assert.Equal("Pat Owner", Assert.Single(r3.Members).FullName);
        Assert.Empty(r4.Members);
    }

    // TC-04-UNIT-03: Search with special characters is safe
    [Fact]
    public async Task Search_with_special_characters_returns_empty_without_error()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var pat = await SeedAsync(db, orgId, "Pat", "Owner", "pat@acme.com");
        var service = new MembersService(db);

        var r1 = await service.GetMembersAsync(orgId, pat.Id, "admin", "<script>", showRemoved: false);
        var r2 = await service.GetMembersAsync(orgId, pat.Id, "admin", "'; DROP TABLE", showRemoved: false);
        var r3 = await service.GetMembersAsync(orgId, pat.Id, "admin", "@#$%", showRemoved: false);

        Assert.Empty(r1.Members);
        Assert.Empty(r2.Members);
        Assert.Empty(r3.Members);
    }

    // TC-04-UNIT-04: Search applies to removed members when showRemoved=true
    [Fact]
    public async Task Search_includes_removed_members_only_when_show_removed_is_true()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var active = await SeedAsync(db, orgId, "Alex", "Active", "alex.active@acme.com");
        await SeedAsync(db, orgId, "Alex", "Removed", "alex.removed@acme.com", status: "removed");

        var service = new MembersService(db);

        var withoutRemoved = await service.GetMembersAsync(orgId, active.Id, "admin", "Alex", showRemoved: false);
        var withRemoved = await service.GetMembersAsync(orgId, active.Id, "admin", "Alex", showRemoved: true);

        Assert.Equal("Alex Active", Assert.Single(withoutRemoved.Members).FullName);
        Assert.Equal(2, withRemoved.Members.Count);
        Assert.Contains(withRemoved.Members, m => m.FullName == "Alex Removed" && m.Status == "removed");
    }

    // TC-04-UNIT-02: Removed-filter combination logic
    [Fact]
    public async Task Show_removed_flag_controls_visible_set()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var a1 = await SeedAsync(db, orgId, "A", "One", "a1@acme.com");
        await SeedAsync(db, orgId, "A", "Two", "a2@acme.com");
        await SeedAsync(db, orgId, "A", "Three", "a3@acme.com", status: "removed");

        var service = new MembersService(db);

        var activeOnly = await service.GetMembersAsync(orgId, a1.Id, "admin", null, showRemoved: false);
        var all = await service.GetMembersAsync(orgId, a1.Id, "admin", null, showRemoved: true);

        Assert.Equal(2, activeOnly.Members.Count);
        Assert.All(activeOnly.Members, m => Assert.Equal("active", m.Status));

        Assert.Equal(3, all.Members.Count);
        Assert.Single(all.Members, m => m.Status == "removed");
    }

    // TC-04-UNIT-05: Permission-matrix lookup
    [Theory]
    [InlineData("admin", true, true, true)]
    [InlineData("manager", true, true, true)]
    [InlineData("user", true, false, false)]
    [InlineData("viewer", true, false, false)]
    public void Permission_matrix_matches_spec(string role, bool canView, bool canInvite, bool canDeleteOrRestore)
    {
        Assert.Equal(canView, MemberPermissions.CanViewList(role));
        Assert.Equal(canInvite, MemberPermissions.CanInvite(role));
        Assert.Equal(canDeleteOrRestore, MemberPermissions.CanDeleteOrRestore(role));
    }

    [Fact]
    public async Task IsLastAdmin_flag_set_only_for_sole_active_admin()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var service = new MembersService(db);

        var result = await service.GetMembersAsync(orgId, admin1.Id, "admin", null, showRemoved: false);

        Assert.True(Assert.Single(result.Members).IsLastAdmin);
    }

    [Fact]
    public async Task Delete_sets_status_removed_and_rotates_security_stamp()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var target = await SeedAsync(db, orgId, "User", "Target", "target@acme.com", role: "user");
        var account = await db.Accounts.SingleAsync(a => a.Id == target.AccountId);
        var originalStamp = account.SecurityStamp;

        var service = new MembersService(db);
        var result = await service.DeleteAsync(orgId, target.Id, admin1.Id, "admin");

        Assert.Equal(MemberActionOutcome.Success, result.Outcome);
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == target.Id);
        Assert.Equal("removed", reloaded.Status);
        var reloadedAccount = await db.Accounts.SingleAsync(a => a.Id == target.AccountId);
        Assert.NotEqual(originalStamp, reloadedAccount.SecurityStamp);
    }

    [Fact]
    public async Task Delete_blocked_for_self()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        await SeedAsync(db, orgId, "Admin", "Two", "admin2@acme.com", role: "admin");
        var service = new MembersService(db);

        var result = await service.DeleteAsync(orgId, admin1.Id, admin1.Id, "admin");

        Assert.Equal(MemberActionOutcome.Conflict, result.Outcome);
        Assert.Equal("cannot_remove_self", result.ErrorCode);
    }

    [Fact]
    public async Task Delete_blocked_for_last_admin()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var manager = await SeedAsync(db, orgId, "Mgr", "One", "mgr1@acme.com", role: "manager");
        var service = new MembersService(db);

        var result = await service.DeleteAsync(orgId, admin1.Id, manager.Id, "manager");

        Assert.Equal(MemberActionOutcome.Conflict, result.Outcome);
        Assert.Equal("last_admin_guard", result.ErrorCode);
    }

    [Theory]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task Delete_and_restore_forbidden_for_non_managing_roles(string role)
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var target = await SeedAsync(db, orgId, "User", "Target", "target@acme.com", role: "user");
        var caller = await SeedAsync(db, orgId, "Caller", "Person", "caller@acme.com", role: role);
        var service = new MembersService(db);

        var deleteResult = await service.DeleteAsync(orgId, target.Id, caller.Id, role);
        var restoreResult = await service.RestoreAsync(orgId, admin1.Id, role);

        Assert.Equal(MemberActionOutcome.Forbidden, deleteResult.Outcome);
        Assert.Equal(MemberActionOutcome.Forbidden, restoreResult.Outcome);
    }

    [Fact]
    public async Task Restore_resets_joined_date_clears_job_title_and_keeps_role()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var removed = await SeedAsync(db, orgId, "User", "Removed", "removed@acme.com", role: "user", status: "removed");
        removed.JoinedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        removed.JobTitle = "Engineer";
        await db.SaveChangesAsync();

        var service = new MembersService(db);
        var result = await service.RestoreAsync(orgId, removed.Id, "admin");

        Assert.Equal(MemberActionOutcome.Success, result.Outcome);
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == removed.Id);
        Assert.Equal("active", reloaded.Status);
        Assert.Equal("user", reloaded.Role);
        Assert.Null(reloaded.JobTitle);
        Assert.True(reloaded.JoinedAt > new DateTime(2025, 1, 2));
    }

    [Fact]
    public async Task Restore_rejected_when_not_removed()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var active = await SeedAsync(db, orgId, "User", "Active", "active@acme.com", role: "user");
        var service = new MembersService(db);

        var result = await service.RestoreAsync(orgId, active.Id, "admin");

        Assert.Equal(MemberActionOutcome.Conflict, result.Outcome);
        Assert.Equal("not_removed", result.ErrorCode);
    }

    [Fact]
    public async Task Delete_rejected_when_already_removed()
    {
        await using var db = NewDb();
        var orgId = Guid.NewGuid();
        var admin1 = await SeedAsync(db, orgId, "Admin", "One", "admin1@acme.com", role: "admin");
        var removed = await SeedAsync(db, orgId, "User", "Removed", "removed@acme.com", role: "user", status: "removed");
        var service = new MembersService(db);

        var result = await service.DeleteAsync(orgId, removed.Id, admin1.Id, "admin");

        Assert.Equal(MemberActionOutcome.Conflict, result.Outcome);
        Assert.Equal("already_removed", result.ErrorCode);
    }
}
