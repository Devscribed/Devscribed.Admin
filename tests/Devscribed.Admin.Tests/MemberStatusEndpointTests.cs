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

public class MemberStatusEndpointTests : IAsyncLifetime
{
    private WebApplicationFactory<Program> _factory = null!;
    private SqliteConnection _connection = null!;

    private Guid _orgId;
    private Account _adminAccount = null!;
    private Account _managerAccount = null!;
    private Account _userAccount = null!;
    private Account _viewerAccount = null!;
    private Account _targetAccount = null!;
    private Account _removedAccount = null!;
    private Membership _adminMembership = null!;
    private Membership _targetMembership = null!;
    private Membership _removedMembership = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _orgId = Guid.NewGuid();
        var org = new Organization { Id = _orgId, Name = "Test Org" };

        _adminAccount = new Account { Email = "admin@test.com", PasswordHash = "x", FirstName = "Admin", LastName = "One" };
        _managerAccount = new Account { Email = "manager@test.com", PasswordHash = "x", FirstName = "Manager", LastName = "One" };
        _userAccount = new Account { Email = "user@test.com", PasswordHash = "x", FirstName = "User", LastName = "One" };
        _viewerAccount = new Account { Email = "viewer@test.com", PasswordHash = "x", FirstName = "Viewer", LastName = "One" };
        _targetAccount = new Account { Email = "alex@test.com", PasswordHash = "x", FirstName = "Alex", LastName = "Kaminski" };
        _removedAccount = new Account { Email = "removed@test.com", PasswordHash = "x", FirstName = "Removed", LastName = "Member" };

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
        var viewerMembership = new Membership
        {
            AccountId = _viewerAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Viewer, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = _targetAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _removedMembership = new Membership
        {
            AccountId = _removedAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Removed
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
        db.Accounts.AddRange(_adminAccount, _managerAccount, _userAccount, _viewerAccount, _targetAccount, _removedAccount);
        db.Memberships.AddRange(_adminMembership, managerMembership, userMembership, viewerMembership, _targetMembership, _removedMembership);
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

    [Fact]
    public async Task Admin_can_remove_member()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PostAsync($"/api/members/{_targetMembership.Id}/remove", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var target = await db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipStatus.Removed, target!.Status);
    }

    [Fact]
    public async Task Admin_can_restore_member()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PostAsync($"/api/members/{_removedMembership.Id}/restore", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var target = await db.Memberships.FindAsync(_removedMembership.Id);
        Assert.Equal(MembershipStatus.Active, target!.Status);
    }

    [Fact]
    public async Task Manager_can_remove_member()
    {
        using var client = CreateClientAs(_managerAccount, MembershipRole.Manager);

        var response = await client.PostAsync($"/api/members/{_targetMembership.Id}/remove", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(MembershipRole.User)]
    [InlineData(MembershipRole.Viewer)]
    public async Task User_and_viewer_cannot_delete_or_restore(MembershipRole role)
    {
        var account = role == MembershipRole.User ? _userAccount : _viewerAccount;
        using var client = CreateClientAs(account, role);

        var deleteResponse = await client.PostAsync($"/api/members/{_targetMembership.Id}/remove", null);
        var restoreResponse = await client.PostAsync($"/api/members/{_removedMembership.Id}/restore", null);

        Assert.Equal(HttpStatusCode.Forbidden, deleteResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, restoreResponse.StatusCode);
    }

    [Fact]
    public async Task Last_admin_delete_returns_400()
    {
        using var client = CreateClientAs(_adminAccount, MembershipRole.Admin);

        var response = await client.PostAsync($"/api/members/{_adminMembership.Id}/remove", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Contains("at least one admin", body!.Error!);
    }

    private record ErrorResponse(string? Error);
}
