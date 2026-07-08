using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

public class RoleEndpointTests : IAsyncLifetime
{
    private WebApplicationFactory<Program> _factory = null!;
    private SqliteConnection _connection = null!;

    private Guid _orgId;
    private Account _adminAccount = null!;
    private Account _managerAccount = null!;
    private Account _userAccount = null!;
    private Account _targetAccount = null!;
    private Membership _adminMembership = null!;
    private Membership _targetMembership = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _orgId = Guid.NewGuid();
        var org = new Organization { Id = _orgId, Name = "Test Org" };

        _adminAccount = new Account { Email = "admin@test.com", PasswordHash = "x", FirstName = "Admin", LastName = "One" };
        _managerAccount = new Account { Email = "manager@test.com", PasswordHash = "x", FirstName = "Manager", LastName = "One" };
        _userAccount = new Account { Email = "user@test.com", PasswordHash = "x", FirstName = "User", LastName = "One" };
        _targetAccount = new Account { Email = "alex@test.com", PasswordHash = "x", FirstName = "Alex", LastName = "Kaminski" };

        _adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        var managerMembership = new Membership
        {
            AccountId = _managerAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Manager, Status = MembershipStatus.Active
        };
        var userMembership = new Membership
        {
            AccountId = _userAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = _targetAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };

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
        db.Organizations.Add(org);
        db.Accounts.AddRange(_adminAccount, _managerAccount, _userAccount, _targetAccount);
        db.Memberships.AddRange(_adminMembership, managerMembership, userMembership, _targetMembership);
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
        client.DefaultRequestHeaders.Add("X-Test-OrgId", _orgId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgName", "Test Org");
        client.DefaultRequestHeaders.Add("X-Test-FirstName", account.FirstName);
        client.DefaultRequestHeaders.Add("X-Test-LastName", account.LastName);
        return client;
    }

    /// <summary>TC-03-E2E-01: Manager calling role-change endpoint is rejected with 403.</summary>
    [Fact]
    public async Task Manager_role_change_returns_403()
    {
        using var client = CreateClientAs(_managerAccount, MembershipRole.Manager);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/role",
            new { role = "Manager" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    /// <summary>TC-03-E2E-01: User calling role-change endpoint is rejected with 403.</summary>
    [Fact]
    public async Task User_role_change_returns_403()
    {
        using var client = CreateClientAs(_userAccount, MembershipRole.User);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/role",
            new { role = "Manager" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    /// <summary>TC-03-E2E-02: Admin changes role and it persists.</summary>
    [Fact]
    public async Task Admin_changes_role_and_it_persists()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/role",
            new { role = "Manager" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var target = await db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipRole.Manager, target!.Role);
    }

    /// <summary>TC-03-INT-02 via HTTP: Last admin self-demotion returns 400.</summary>
    [Fact]
    public async Task Last_admin_self_demotion_returns_400()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_adminMembership.Id}/role",
            new { role = "Manager" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Contains("at least one admin", body!.Error!);
    }

    [Fact]
    public async Task Invalid_role_returns_400()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PutAsJsonAsync(
            $"/api/members/{_targetMembership.Id}/role",
            new { role = "SuperAdmin" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private record ErrorResponse(string? Error);
}
