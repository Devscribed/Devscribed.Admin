using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class AccountSettingsIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public AccountSettingsIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<Account> SeedAccountAsync(string email, string password, string status = "active")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = "Pat",
            LastName = "Owner",
            Timezone = "America/New_York",
            CreatedAt = DateTime.UtcNow,
        };
        var org = new Organization { Id = Guid.NewGuid(), Name = "Acme Inc", CreatedAt = DateTime.UtcNow };
        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = "admin",
            Status = status,
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Organizations.Add(org);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();
        return account;
    }

    private async Task<HttpClient> LoggedInClientAsync(string email, string password, WebApplicationFactoryClientOptions? options = null)
    {
        var client = options != null ? _factory.CreateClient(options) : _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static string ExtractToken(string emailBody)
    {
        var match = Regex.Match(emailBody, @"token=([^\s&]+)");
        Assert.True(match.Success, "No token found in email body: " + emailBody);
        return match.Groups[1].Value;
    }

    private static object ValidSettingsBody(
        string firstName = "Pat", string lastName = "Owner",
        string? phoneCountryCode = null, string? phoneNumber = null,
        string timezone = "America/New_York", string firstDayOfWeek = "Monday") => new
        {
            firstName,
            lastName,
            phoneCountryCode,
            phoneNumber,
            timezone,
            firstDayOfWeek,
        };

    // TC-06-INT-01: Change email requires confirmation before it takes effect and notifies old address
    [Fact]
    public async Task Change_email_requires_confirmation_and_notifies_old_address()
    {
        await SeedAccountAsync("pat01@acme.com", "Passw0rd");
        var noRedirect = new WebApplicationFactoryClientOptions { AllowAutoRedirect = false };
        var client = await LoggedInClientAsync("pat01@acme.com", "Passw0rd", noRedirect);

        var changeResponse = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "new01@acme.com" });
        Assert.Equal(HttpStatusCode.OK, changeResponse.StatusCode);
        var changeBody = await changeResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("A confirmation link has been sent to your new email address", changeBody!.RootElement.GetProperty("message").GetString());

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        Assert.Single(sender.Sent, e => e.ToEmail == "new01@acme.com");
        Assert.Single(sender.Sent, e => e.ToEmail == "pat01@acme.com");

        var loginAttempt = await _factory.CreateClient(noRedirect).PostAsJsonAsync("/api/login", new { email = "new01@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.BadRequest, loginAttempt.StatusCode);

        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new01@acme.com").Body);
        var confirmResponse = await _factory.CreateClient(noRedirect).PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);

        var newLoginResponse = await _factory.CreateClient(noRedirect).PostAsJsonAsync("/api/login", new { email = "new01@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, newLoginResponse.StatusCode);

        var oldLoginResponse = await _factory.CreateClient(noRedirect).PostAsJsonAsync("/api/login", new { email = "pat01@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.BadRequest, oldLoginResponse.StatusCode);
    }

    // TC-06-INT-02: Change password requires the correct current password
    [Fact]
    public async Task Change_password_requires_correct_current_password()
    {
        await SeedAccountAsync("pat2@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("pat2@acme.com", "Passw0rd");

        var wrongResponse = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "wrong",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongResponse.StatusCode);
        var wrongBody = await wrongResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Current password is incorrect", wrongBody!.RootElement.GetProperty("message").GetString());

        var correctResponse = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, correctResponse.StatusCode);

        var loginResponse = await _factory.CreateClient().PostAsJsonAsync("/api/login", new { email = "pat2@acme.com", password = "NewPass1" });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
    }

    // TC-06-INT-03: Email change token expires after 24 hours
    [Fact]
    public async Task Email_change_token_expires_after_24_hours()
    {
        var account = await SeedAccountAsync("expiry@acme.com", "Passw0rd");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tokenGen = scope.ServiceProvider.GetRequiredService<ITokenGenerator>();
        var raw = tokenGen.GenerateToken();
        var createdAt = DateTime.UtcNow.AddHours(-25);
        db.PendingEmailChanges.Add(new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            NewEmail = "new-expiry@acme.com",
            TokenHash = tokenGen.Hash(raw),
            CreatedAt = createdAt,
            ExpiresAt = createdAt.AddHours(24),
        });
        await db.SaveChangesAsync();

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/account/confirm-email", new { token = raw });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This confirmation link has expired", body!.RootElement.GetProperty("message").GetString());

        var refreshed = await db.Accounts.SingleAsync(a => a.Id == account.Id);
        Assert.Equal("expiry@acme.com", refreshed.Email);
    }

    // TC-06-INT-04: Email change fails if new email is taken before confirmation
    [Fact]
    public async Task Email_change_fails_if_new_email_taken_before_confirmation()
    {
        await SeedAccountAsync("racer@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("racer@acme.com", "Passw0rd");

        var changeResponse = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "claimed@acme.com" });
        Assert.Equal(HttpStatusCode.OK, changeResponse.StatusCode);

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "claimed@acme.com").Body);

        // Another account claims the email in the meantime.
        await SeedAccountAsync("claimed@acme.com", "Passw0rd");

        var confirmResponse = await _factory.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.BadRequest, confirmResponse.StatusCode);
        var confirmBody = await confirmResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This email is already in use", confirmBody!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var racer = await db.Accounts.SingleAsync(a => a.Email == "racer@acme.com");
        Assert.Equal("racer@acme.com", racer.Email);

        var pending = await db.PendingEmailChanges.SingleAsync(p => p.AccountId == racer.Id);
        Assert.Null(pending.UsedAt);
    }

    // TC-06-INT-05: Second email change request invalidates first token
    [Fact]
    public async Task Second_email_change_request_invalidates_first_token()
    {
        await SeedAccountAsync("multi@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("multi@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "new1@acme.com" });
        var t1 = ExtractToken(sender.Sent.First(e => e.ToEmail == "new1@acme.com").Body);

        await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "new2@acme.com" });
        var t2 = ExtractToken(sender.Sent.First(e => e.ToEmail == "new2@acme.com").Body);

        var r1 = await _factory.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token = t1 });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This confirmation link is no longer valid", r1Body!.RootElement.GetProperty("message").GetString());

        var r2 = await _factory.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token = t2 });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.SingleAsync(a => a.Email == "new2@acme.com");
        Assert.NotNull(account);
    }

    // TC-06-INT-06: Change password revokes other sessions but keeps current
    [Fact]
    public async Task Change_password_revokes_other_sessions_but_keeps_current()
    {
        await SeedAccountAsync("revoke6@acme.com", "Passw0rd");
        var noRedirect = new WebApplicationFactoryClientOptions { AllowAutoRedirect = false };

        var sessionA = await LoggedInClientAsync("revoke6@acme.com", "Passw0rd", noRedirect);
        var sessionB = await LoggedInClientAsync("revoke6@acme.com", "Passw0rd", noRedirect);

        Assert.Equal(HttpStatusCode.OK, (await sessionA.GetAsync("/members")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await sessionB.GetAsync("/members")).StatusCode);

        var changeResponse = await sessionA.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, changeResponse.StatusCode);

        var afterA = await sessionA.GetAsync("/members");
        var afterB = await sessionB.GetAsync("/members");

        Assert.Equal(HttpStatusCode.OK, afterA.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, afterB.StatusCode);
        Assert.Contains("/login", afterB.Headers.Location!.ToString());
    }

    // TC-06-INT-07: Email change to uppercase normalizes correctly
    [Fact]
    public async Task Email_change_to_uppercase_normalizes_correctly()
    {
        await SeedAccountAsync("upper@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("upper@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        var changeResponse = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "NEW@ACME.COM" });
        Assert.Equal(HttpStatusCode.OK, changeResponse.StatusCode);

        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new@acme.com").Body);
        var confirmResponse = await _factory.CreateClient().PostAsJsonAsync("/api/account/confirm-email", new { token });
        Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);

        var loginResponse = await _factory.CreateClient().PostAsJsonAsync("/api/login", new { email = "new@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
    }

    // TC-06-INT-08: Change email to current email rejected
    [Fact]
    public async Task Change_email_to_current_email_rejected()
    {
        await SeedAccountAsync("same8@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("same8@acme.com", "Passw0rd");

        var r1 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "same8@acme.com" });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This is already your email address", r1Body!.RootElement.GetProperty("message").GetString());

        var r2 = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "SAME8@ACME.COM" });
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var r2Body = await r2.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This is already your email address", r2Body!.RootElement.GetProperty("message").GetString());
    }

    // TC-06-INT-09: Confirm email — public endpoint, no auth required
    [Fact]
    public async Task Confirm_email_is_public_and_requires_no_auth()
    {
        await SeedAccountAsync("public9@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("public9@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "new9@acme.com" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new9@acme.com").Body);

        var anonymousClient = _factory.CreateClient();
        var response = await anonymousClient.PostAsJsonAsync("/api/account/confirm-email", new { token });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Your email has been updated", body!.RootElement.GetProperty("message").GetString());
    }

    // TC-06-INT-10: Change password with confirmation mismatch rejected
    [Fact]
    public async Task Change_password_with_confirmation_mismatch_rejected()
    {
        await SeedAccountAsync("mismatch10@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("mismatch10@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "NewPass1",
            passwordConfirmation = "NewPass2",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Passwords do not match", body!.RootElement.GetProperty("message").GetString());

        var loginResponse = await _factory.CreateClient().PostAsJsonAsync("/api/login", new { email = "mismatch10@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
    }

    // TC-06-INT-11: Change password with policy-violating new password rejected
    [Fact]
    public async Task Change_password_with_policy_violating_new_password_rejected()
    {
        await SeedAccountAsync("policy11@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("policy11@acme.com", "Passw0rd");

        var r1 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "short",
            passwordConfirmation = "short",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Equal("Password must be at least 8 characters", (await r1.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("message").GetString());

        var r2 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "nDigits!",
            passwordConfirmation = "nDigits!",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        Assert.Equal("Password must contain at least one digit", (await r2.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("message").GetString());

        var r3 = await client.PostAsJsonAsync("/api/account/change-password", new
        {
            currentPassword = "Passw0rd",
            newPassword = "12345678",
            passwordConfirmation = "12345678",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r3.StatusCode);
        Assert.Equal("Password must contain at least one letter", (await r3.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("message").GetString());
    }

    // TC-06-INT-12: Edit information — phone validation per country at API level
    [Fact]
    public async Task Edit_information_phone_validation_per_country()
    {
        await SeedAccountAsync("phone12@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("phone12@acme.com", "Passw0rd");

        var r1 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(phoneCountryCode: "US", phoneNumber: "(555) 123-4567"));
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);

        var r2 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(phoneCountryCode: "US", phoneNumber: "12345"));
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var r2Body = await r2.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Enter a valid phone number", r2Body!.RootElement.GetProperty("errors").GetProperty("phoneNumber").GetString());

        var r3 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(phoneCountryCode: null, phoneNumber: null));
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
    }

    // TC-06-INT-13: Edit information — name validation at API level
    [Fact]
    public async Task Edit_information_name_validation()
    {
        await SeedAccountAsync("name13@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("name13@acme.com", "Passw0rd");

        var r1 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(firstName: ""));
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Equal("First name is required", (await r1.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("errors").GetProperty("firstName").GetString());

        var r2 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(firstName: "Pat2"));
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces",
            (await r2.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("errors").GetProperty("firstName").GetString());

        var r3 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(lastName: ""));
        Assert.Equal(HttpStatusCode.BadRequest, r3.StatusCode);
        Assert.Equal("Last name is required", (await r3.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("errors").GetProperty("lastName").GetString());
    }

    // TC-06-INT-14: Unauthenticated access to account settings rejected
    [Fact]
    public async Task Unauthenticated_access_rejected()
    {
        var client = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/account/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "x@acme.com" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/account/change-password", new { currentPassword = "a", newPassword = "NewPass1", passwordConfirmation = "NewPass1" })).StatusCode);
    }

    // TC-06-INT-15: Edit information persists and returns on GET
    [Fact]
    public async Task Edit_information_persists_and_returns_on_get()
    {
        await SeedAccountAsync("persist15@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("persist15@acme.com", "Passw0rd");

        var putResponse = await client.PutAsJsonAsync("/api/account/settings", new
        {
            firstName = "Dima",
            lastName = "Bezzubenkov",
            phoneCountryCode = "US",
            phoneNumber = "(555) 123-4567",
            timezone = "America/Los_Angeles",
            firstDayOfWeek = "Sunday",
        });
        Assert.Equal(HttpStatusCode.OK, putResponse.StatusCode);

        var getResponse = await client.GetAsync("/api/account/settings");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        var body = await getResponse.Content.ReadFromJsonAsync<JsonDocument>();
        var root = body!.RootElement;
        Assert.Equal("Dima", root.GetProperty("firstName").GetString());
        Assert.Equal("Bezzubenkov", root.GetProperty("lastName").GetString());
        Assert.Equal("US", root.GetProperty("phoneCountryCode").GetString());
        Assert.Equal("(555) 123-4567", root.GetProperty("phoneNumber").GetString());
        Assert.Equal("America/Los_Angeles", root.GetProperty("timezone").GetString());
        Assert.Equal("Sunday", root.GetProperty("firstDayOfWeek").GetString());
    }

    // TC-06-INT-16: Change email to an email already in use at request time
    [Fact]
    public async Task Change_email_to_email_already_in_use_at_request_time()
    {
        await SeedAccountAsync("pat16@acme.com", "Passw0rd");
        await SeedAccountAsync("taken16@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("pat16@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/account/change-email", new { newEmail = "taken16@acme.com" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This email is already in use", body!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pat = await db.Accounts.SingleAsync(a => a.Email == "pat16@acme.com");
        Assert.False(await db.PendingEmailChanges.AnyAsync(p => p.AccountId == pat.Id));

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        Assert.DoesNotContain(sender.Sent, e => e.ToEmail == "taken16@acme.com" && e.Subject.Contains("Confirm"));
    }

    // TC-06-INT-17: Edit information — timezone and first-day-of-week validation at API level
    [Fact]
    public async Task Edit_information_timezone_and_first_day_of_week_validation()
    {
        await SeedAccountAsync("tzfd17@acme.com", "Passw0rd");
        var client = await LoggedInClientAsync("tzfd17@acme.com", "Passw0rd");

        var r1 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(timezone: ""));
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Equal("Timezone is required", (await r1.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("errors").GetProperty("timezone").GetString());

        var r2 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody(firstDayOfWeek: "Saturday"));
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        Assert.Equal("Invalid first day of week", (await r2.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement.GetProperty("errors").GetProperty("firstDayOfWeek").GetString());

        var r3 = await client.PutAsJsonAsync("/api/account/settings", ValidSettingsBody());
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
    }
}
