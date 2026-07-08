using System.Net;
using System.Net.Http.Json;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

/// <summary>TC-06-INT-01 and TC-06-INT-02: Save allowed/rejected based on role.</summary>
public class JobTitleEndpointTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;

    private Guid _organizationId;
    private Account _adminAccount = null!;
    private Account _managerAccount = null!;
    private Account _userAccount = null!;
    private Account _viewerAccount = null!;
    private Membership _targetMembership = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _organizationId = Guid.NewGuid();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AdminDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<AdminDbContext>(options => options.UseSqlite(_connection));

                services.AddAuthentication("Test")
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        await db.Database.EnsureCreatedAsync();

        var org = new Organization { Id = _organizationId, Name = "Acme Inc" };

        _adminAccount = new Account { Email = "admin@acme.com", PasswordHash = "x", FirstName = "Pat", LastName = "Owner" };
        _managerAccount = new Account { Email = "manager@acme.com", PasswordHash = "x", FirstName = "Mary", LastName = "Manager" };
        _userAccount = new Account { Email = "user@acme.com", PasswordHash = "x", FirstName = "Uma", LastName = "User" };
        _viewerAccount = new Account { Email = "viewer@acme.com", PasswordHash = "x", FirstName = "Victor", LastName = "Viewer" };
        var targetAccount = new Account { Email = "target@acme.com", PasswordHash = "x", FirstName = "Aleksey", LastName = "Siniakevich" };

        var adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        var managerMembership = new Membership
        {
            AccountId = _managerAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Manager, Status = MembershipStatus.Active
        };
        var userMembership = new Membership
        {
            AccountId = _userAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        var viewerMembership = new Membership
        {
            AccountId = _viewerAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Viewer, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = targetAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active,
            JobTitle = "Engineer"
        };

        db.Organizations.Add(org);
        db.Accounts.AddRange(_adminAccount, _managerAccount, _userAccount, _viewerAccount, targetAccount);
        db.Memberships.AddRange(adminMembership, managerMembership, userMembership, viewerMembership, _targetMembership);
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private HttpClient CreateClientAs(Account account, MembershipRole role)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Test-AccountId", account.Id.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Email", account.Email);
        client.DefaultRequestHeaders.Add("X-Test-Role", role.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgId", _organizationId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgName", "Acme Inc");
        client.DefaultRequestHeaders.Add("X-Test-FirstName", account.FirstName);
        client.DefaultRequestHeaders.Add("X-Test-LastName", account.LastName);
        return client;
    }

    /// <summary>TC-06-INT-01: admin and manager can save job title.</summary>
    [Fact]
    public async Task Admin_and_manager_can_update_job_title()
    {
        using var adminClient = CreateClientAs(_adminAccount, MembershipRole.Admin);
        var adminResponse = await adminClient.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/job-title",
            new { jobTitle = "Engineer" });
        Assert.Equal(HttpStatusCode.OK, adminResponse.StatusCode);

        using var managerClient = CreateClientAs(_managerAccount, MembershipRole.Manager);
        var managerResponse = await managerClient.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/job-title",
            new { jobTitle = "Senior Engineer" });
        Assert.Equal(HttpStatusCode.OK, managerResponse.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var membership = await db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal("Senior Engineer", membership!.JobTitle);
    }

    /// <summary>TC-06-INT-02: user and viewer are rejected.</summary>
    [Theory]
    [InlineData(MembershipRole.User)]
    [InlineData(MembershipRole.Viewer)]
    public async Task User_and_viewer_cannot_update_job_title(MembershipRole role)
    {
        var account = role == MembershipRole.User ? _userAccount : _viewerAccount;
        using var client = CreateClientAs(account, role);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/job-title",
            new { jobTitle = "Hacker" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var membership = await db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal("Engineer", membership!.JobTitle);
    }
}
